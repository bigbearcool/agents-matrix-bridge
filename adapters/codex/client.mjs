/**
 * Minimal Codex app-server client (stdio JSON-RPC).
 *
 * The bridge only needs three things from Codex:
 *   - one long-lived `codex app-server --listen stdio://` child process;
 *   - `thread/start` / `thread/resume`;
 *   - `turn/start` plus approval/user-input round-trips.
 *
 * Everything else (session persistence, queueing, Matrix I/O) lives in
 * `@matrix-bridge/core`.  The class intentionally has no dependency on Matrix
 * or on the core package so it can also be used by standalone scripts/tests.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

const DEFAULT_APP_SERVER_ARGS = ['app-server', '--listen', 'stdio://'];
const APPROVAL_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval'
]);
const INPUT_METHODS = new Set([
  'item/tool/requestUserInput',
  'item/tool/request_user_input'
]);
const MAX_STDERR_CHARS = 16 * 1024;
const CLIENT_OPTION_KEYS = new Set([
  'command', 'args', 'appServerArgs', 'env', 'spawnOptions',
  'requestTimeoutMs', 'turnTimeoutMs', 'clientInfo'
]);

/**
 * The legacy signature was `new CodexClient(command, env)`.  Recognize a bare
 * environment map so older host code keeps working.
 */
function looksLikeEnvironment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (keys.some((key) => CLIENT_OPTION_KEYS.has(key))) return false;
  return keys.every((key) => typeof value[key] === 'string' || value[key] === undefined)
    && keys.some((key) => key === key.toUpperCase());
}

function normalizeDecision(value) {
  if (value && typeof value === 'object') {
    return normalizeDecision(value.decision ?? value.result ?? value.answer);
  }
  const decision = String(value ?? '').trim().toLowerCase();
  if (['accept', 'accepted', 'approve', 'approved', 'allow', 'allowed', 'yes', 'y', 'true'].includes(decision)) {
    return 'accept';
  }
  return 'decline';
}

function normalizeAnswers(value) {
  if (value == null) return {};
  if (typeof value !== 'object') return { answer: String(value) };
  if (value.answers && typeof value.answers === 'object') return value.answers;
  return value;
}

function normalizeInput(attachments) {
  if (!Array.isArray(attachments)) return [];
  const input = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const path = attachment.path || attachment.file || attachment.localPath;
    if (!path || typeof path !== 'string') continue;
    const rawType = String(attachment.type || 'localImage');
    let type = rawType;
    if (['image', 'local_image', 'localimage'].includes(rawType.toLowerCase())) type = 'localImage';
    else if (['audio', 'local_audio', 'localaudio'].includes(rawType.toLowerCase())) type = 'localAudio';
    input.push({ ...attachment, type, path });
  }
  return input;
}

function collectChangedFiles(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string') {
    if (output.length < 200) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectChangedFiles(item, output);
    return output;
  }
  if (typeof value !== 'object') return output;
  if (typeof value.path === 'string') output.push(value.path);
  else if (typeof value.file === 'string') output.push(value.file);
  if (value.changes) collectChangedFiles(value.changes, output);
  if (value.files) collectChangedFiles(value.files, output);
  // Codex fileChange payloads commonly use { "/abs/path": {...} } maps.
  for (const key of Object.keys(value)) {
    if (key.includes('/') || key.includes('\\')) output.push(key);
  }
  return output;
}

export class CodexClient extends EventEmitter {
  /**
   * @param {string|object} command Executable path/name, or an options object.
   * @param {object} [options]
   */
  constructor(command = 'codex', options = {}) {
    super();
    if (command && typeof command === 'object') {
      options = command;
      command = options.command;
    } else if (looksLikeEnvironment(options)) {
      options = { env: options };
    }
    this.command = command || 'codex';
    this.args = Array.isArray(options.args)
      ? [...options.args]
      : Array.isArray(options.appServerArgs)
        ? [...options.appServerArgs]
        : [...DEFAULT_APP_SERVER_ARGS];
    this.env = options.env || process.env;
    this.spawnOptions = options.spawnOptions || {};
    this.requestTimeoutMs = Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : 30_000;
    this.turnTimeoutMs = Number(options.turnTimeoutMs) > 0 ? Number(options.turnTimeoutMs) : 30 * 60_000;
    this.clientInfo = options.clientInfo || {
      name: 'matrix_bridge',
      title: 'Matrix Bridge',
      version: '1.0.0'
    };

    this.seq = 0;
    this.pending = new Map();
    this.callbacksByThread = new Map();
    this.lastCallbacks = null;
    this.stderr = '';
    this.closed = false;
    this.child = null;
    this.initialized = null;

    this._start();
  }

  _start() {
    let child;
    try {
      child = spawn(this.command, this.args, {
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...this.spawnOptions
      });
    } catch (error) {
      this.closed = true;
      this.spawnError = error;
      queueMicrotask(() => this.emit('closed', error));
      return;
    }
    this.child = child;

    const fail = (reason) => {
      if (this.closed) return;
      this.closed = true;
      const error = reason instanceof Error ? reason : new Error(String(reason || 'Codex app-server exited'));
      this._rejectAll(error);
      this.callbacksByThread.clear();
      this.lastCallbacks = null;
      this.emit('closed', error);
    };

    child.on('error', (error) => fail(new Error(`Codex app-server failed to start: ${error.message}`)));
    child.on('exit', (code, signal) => {
      const tail = this.stderr.trim();
      const detail = tail ? `: ${tail.slice(-500)}` : '';
      fail(new Error(`Codex app-server exited${code != null ? ` (code ${code})` : signal ? ` (${signal})` : ''}${detail}`));
    });
    child.stderr?.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-MAX_STDERR_CHARS);
    });
    child.stdin?.on('error', (error) => {
      // EPIPE is reported again by the exit handler; avoid noisy unhandled errors.
      if (error?.code !== 'EPIPE') this.stderr = (this.stderr + `\n${error.message}`).slice(-MAX_STDERR_CHARS);
    });

    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', (line) => this._onLine(line));
    }
  }

  _onLine(line) {
    const text = String(line || '').trim();
    if (!text) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      this.emit('protocolError', new Error(`Invalid Codex JSON-RPC line: ${text.slice(0, 200)}`));
      return;
    }
    if (message && typeof message.method === 'string' && message.id !== undefined) {
      this.emit('serverRequest', message);
      void this._handleServerRequest(message);
      return;
    }
    if (message && message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const error = new Error(message.error.message || `Codex ${pending.method} failed`);
        error.code = message.error.code;
        error.data = message.error.data;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message && typeof message.method === 'string') {
      this.emit('notification', message.method, message.params || {});
    }
  }

  async _handleServerRequest(message) {
    const { id, method, params = {} } = message;
    if (APPROVAL_METHODS.has(method) || INPUT_METHODS.has(method)) {
      // Backwards-compatible observability hook (the adapter itself answers
      // the request through the callbacks below).
      this.emit('approval', message);
    }
    const callbacks = this.callbacksByThread.get(params.threadId) || this.lastCallbacks || {};
    try {
      if (APPROVAL_METHODS.has(method)) {
        let decision = 'decline';
        if (typeof callbacks.onApproval === 'function') {
          try {
            decision = normalizeDecision(await callbacks.onApproval(message));
          } catch {
            decision = 'decline';
          }
        }
        const result = method === 'item/permissions/requestApproval'
          ? {
              permissions: decision === 'accept' ? (params.permissions || {}) : {},
              ...(decision === 'accept' ? { scope: 'turn' } : {})
            }
          : { decision };
        this._respond(id, result);
        return;
      }
      if (INPUT_METHODS.has(method)) {
        let answers = {};
        if (typeof callbacks.onInput === 'function') {
          try {
            answers = normalizeAnswers(await callbacks.onInput(message));
          } catch {
            answers = {};
          }
        }
        this._respond(id, { answers });
        return;
      }
      this._respondError(id, -32601, `Unsupported server request: ${method}`);
    } catch (error) {
      this._respondError(id, -32603, error.message || 'Internal error');
    }
  }

  _write(payload) {
    if (this.closed || !this.child?.stdin?.writable) {
      throw new Error('Codex app-server is not running');
    }
    this.child.stdin.write(payload, (error) => {
      if (error && error.code !== 'EPIPE') this.emit('protocolError', error);
    });
  }

  _respond(id, result) {
    try {
      this._write(`${JSON.stringify({ id, result })}\n`);
    } catch {
      // The exit handler will reject any caller waiting on this turn.
    }
  }

  _respondError(id, code, message) {
    try {
      this._write(`${JSON.stringify({ id, error: { code, message } })}\n`);
    } catch {
      // Ignore — the connection is already gone.
    }
  }

  _rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(method, params, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (this.closed) {
      return Promise.reject(this.spawnError || new Error('Codex app-server is not running'));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        const error = new Error(`Codex ${method} request timed out; outcome unknown`);
        error.code = 'ETIMEDOUT';
        reject(error);
      }, Math.max(1, Number(timeoutMs) || this.requestTimeoutMs));
      if (typeof timer.unref === 'function') timer.unref();
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this._write(`${JSON.stringify({ id, method, params: params ?? {} })}\n`);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async initialize() {
    if (this.closed) throw this.spawnError || new Error('Codex app-server is not running');
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.request('initialize', { clientInfo: this.clientInfo });
        this._write(`${JSON.stringify({ method: 'initialized' })}\n`);
      })().catch((error) => {
        this.initialized = null;
        throw error;
      });
    }
    return this.initialized;
  }

  /**
   * Run a single turn.
   * @returns {Promise<{text: string, threadId: string, approval: boolean, generatedFiles: string[], turn: object}>}
   */
  async turn({
    threadId = '',
    cwd,
    text = '',
    attachments = [],
    model = '',
    effort = '',
    onThread,
    onApproval,
    onInput,
    approvalPolicy = 'on-request',
    sandbox = 'read-only'
  } = {}) {
    if (!cwd) throw new TypeError('CodexClient.turn requires a cwd');
    await this.initialize();

    const started = await this.request(
      threadId ? 'thread/resume' : 'thread/start',
      threadId
        ? { cwd, approvalPolicy, sandbox, threadId }
        : { cwd, approvalPolicy, sandbox }
    );
    const id = started?.thread?.id;
    if (!id) throw new Error('Codex did not return a thread id');

    const callbacks = { onApproval, onInput };
    this.callbacksByThread.set(id, callbacks);
    this.lastCallbacks = callbacks;
    try {
      if (typeof onThread === 'function') await onThread(id);
    } catch (error) {
      this.callbacksByThread.delete(id);
      if (this.lastCallbacks === callbacks) this.lastCallbacks = null;
      throw error;
    }

    let answer = '';
    let approvalRequested = false;
    const changedFiles = [];
    let activeTurn = '';
    let settled = false;
    let disposeDone = () => {};

    const done = new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('notification', onNotification);
        this.off('closed', onClosed);
      };
      const onNotification = (method, params = {}) => {
        if (params?.threadId && params.threadId !== id) return;
        if (method === 'item/agentMessage/delta' || method === 'item/agent_message/delta') {
          const delta = params.delta ?? params.text ?? '';
          if (typeof delta === 'string') answer += delta;
        }
        if (method === 'item/completed') {
          const item = params.item || {};
          const itemType = String(item.type || '').toLowerCase();
          if (itemType === 'agentmessage' || itemType === 'agent_message') {
            const textValue = item.text ?? item.content ?? answer;
            if (typeof textValue === 'string') answer = textValue;
          }
          if (itemType.includes('filechange') || itemType.includes('file_change')) {
            collectChangedFiles(item.changes || item.files || item.path, changedFiles);
          }
        }
        if (method === 'turn/completed') {
          const completedTurn = params.turn || {};
          if (!activeTurn || completedTurn.id === activeTurn) {
            settled = true;
            cleanup();
            resolve(completedTurn);
          }
        }
      };
      const onClosed = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Codex app-server exited during turn${error?.message ? `: ${error.message}` : ''}`));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        const error = new Error('Codex turn timed out; outcome unknown');
        error.code = 'ETIMEDOUT';
        reject(error);
      }, this.turnTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      disposeDone = () => {
        if (settled) return;
        settled = true;
        cleanup();
      };
      this.on('notification', onNotification);
      this.on('closed', onClosed);
    });
    // The turn may time out while `turn/start` is still in flight; mark the
    // rejection handled now and re-await it below.
    done.catch(() => {});

    // Keep a local listener so approval requests are visible to callers even
    // though CodexClient answers the JSON-RPC request itself.
    const noteApproval = () => { approvalRequested = true; };
    this.on('serverRequest', noteApproval);

    try {
      const turn = await this.request('turn/start', {
        threadId: id,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        input: [
          { type: 'text', text: String(text ?? ''), text_elements: [] },
          ...normalizeInput(attachments)
        ]
      }, { timeoutMs: this.turnTimeoutMs });
      activeTurn = turn?.turn?.id || '';
    } catch (error) {
      disposeDone();
      this.off('serverRequest', noteApproval);
      this.callbacksByThread.delete(id);
      if (this.lastCallbacks === callbacks) this.lastCallbacks = null;
      // A failed start means the turn never began; the connection is still
      // usable, so leave the child process alive.
      throw error;
    }

    let result;
    try {
      result = await done;
    } finally {
      this.off('serverRequest', noteApproval);
      this.callbacksByThread.delete(id);
      if (this.lastCallbacks === callbacks) this.lastCallbacks = null;
    }

    const status = result?.status || 'completed';
    if (status !== 'completed') {
      throw new Error(`Codex turn ${status}${approvalRequested ? '; approval was unavailable' : ''}`);
    }
    return {
      text: answer,
      threadId: id,
      approval: approvalRequested,
      generatedFiles: [...new Set(changedFiles)],
      turn: result
    };
  }

  async respondApproval(id, decision, request) {
    const normalized = normalizeDecision(decision);
    const method = request?.method || '';
    const params = request?.params || {};
    const result = method === 'item/permissions/requestApproval'
      ? {
          permissions: normalized === 'accept' ? (params.permissions || {}) : {},
          ...(normalized === 'accept' ? { scope: 'turn' } : {})
        }
      : { decision: normalized };
    this._respond(id, result);
  }

  respondInput(id, answers) {
    this._respond(id, { answers: normalizeAnswers(answers) });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._rejectAll(new Error('Codex client closed'));
    const child = this.child;
    this.child = null;
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, 2000);
      if (typeof timer.unref === 'function') timer.unref();
    }
    this.emit('closed', new Error('Codex client closed'));
  }
}

export { CodexClient as CodexAppServerClient };
export const CODEX_APPROVAL_METHODS = Object.freeze([...APPROVAL_METHODS]);
export const CODEX_INPUT_METHODS = Object.freeze([...INPUT_METHODS]);

export default CodexClient;
