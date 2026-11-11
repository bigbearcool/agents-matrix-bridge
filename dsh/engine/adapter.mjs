/**
 * DeepSeek Harness (DSH) adapter for @matrix-bridge/core.
 *
 * DSH answers one task per process through the headless profile:
 *
 *   dsh --profile headless --json \
 *       --permission-mode workspace-write --approval-policy never \
 *       [--session-id <id>] <task>
 *
 * `--json` replaces the plain answer with one JSON object per line:
 *
 *   {"type":"session","sessionId":"session-…","cwd":"…"}
 *   {"type":"status","phase":"turn_start","turn":1}
 *   {"type":"thinking","text":"…"}
 *   {"type":"text","text":"…"}
 *   {"type":"tool_call",…} / {"type":"tool_result",…}
 *   {"type":"final","sessionId":"session-…","reason":{"kind":"completed"},"text":"…"}
 *   {"type":"error","message":"…"}        (runner failure, no final event)
 *
 * The opening `session` event carries the durable Session identity that
 * `--session-id` can adopt later; the closing `final` event carries the
 * lossless answer and the turn reason. Text and thinking events arrive when a
 * step commits, so they are safe to concatenate as a fallback answer.
 *
 * Model and reasoning effort are not per-turn headless flags — the profile's
 * `agent-default-model` row owns them — so the adapter accepts them for
 * contract compatibility and only forwards them when the host opts in
 * (`supportsModelFlag` / `supportsEffortFlag`), for example against a custom
 * overlay that adds those options.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { AgentRuntimeAdapter } from './core/adapter.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_PROCESS_OUTPUT = 32 * 1024 * 1024;
const PREFERRED_CLI_PATH = '/Users/xiangyu/bin/dsh';
const DEFAULT_PROFILE = 'headless';
const DEFAULT_PERMISSION_MODE = 'workspace-write';
const DEFAULT_APPROVAL_POLICY = 'never';
const SECRET_ENV_KEYS = Object.freeze(['MATRIX_ACCESS_TOKEN', 'DSH_MATRIX_TOKEN', 'MATRIX_TOKEN']);

const FALLBACK_MODELS = Object.freeze([
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    description: 'DeepSeek chat model for everyday coding and tool use.'
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    description: 'DeepSeek reasoning model for harder multi-step tasks.'
  }
]);

/** Matches the runner's "this Session cannot be adopted" diagnostics. */
const MISSING_SESSION_PATTERN = /does not exist; omit --session-id|no stored Session|cannot be adopted|unknown session/i;

function stripAnsi(value) {
  return String(value || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of SECRET_ENV_KEYS) delete env[key];
  if (!env.LANG) env.LANG = 'en_US.UTF-8';
  env.NO_COLOR = '1';
  return env;
}

function defaultCliPath(options) {
  const configured = options.cliPath || options.defaultCliPath || options.dshCmd || options.dsh_cmd || options.agent_cli_cmd;
  if (configured) return configured;
  return existsSync(PREFERRED_CLI_PATH) ? PREFERRED_CLI_PATH : 'dsh';
}

function resolveCwd(rawCwd) {
  if (!rawCwd) return { path: process.cwd() };
  const path = resolve(String(rawCwd));
  try {
    if (!statSync(path).isDirectory()) return { error: new Error(`cwd is not a directory: ${path}`) };
  } catch {
    return { error: new Error(`cwd does not exist: ${path}`) };
  }
  return { path };
}

function attachmentPath(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';
  const value = attachment.path || attachment.file || attachment.localPath;
  return typeof value === 'string' ? value.trim() : '';
}

function promptWithAttachments(prompt, attachments) {
  const paths = (Array.isArray(attachments) ? attachments : [])
    .map(attachmentPath)
    .filter(Boolean);
  if (paths.length === 0) return prompt;
  return `${prompt}\n\n[附件]\n${paths.map((path) => `- ${path}`).join('\n')}`;
}

/**
 * Scan a DSH reply for bridge file hand-off markers.
 *
 * Recognizes `[SEND_FILE: <path>]`, `<send-file path="…" />` and Markdown
 * image links. Relative paths resolve against the room workspace, and only
 * paths that exist as files are reported.
 */
export function scanGeneratedFiles(replyText, cwd) {
  const text = String(replyText || '');
  const found = new Set();
  const add = (rawPath) => {
    const value = String(rawPath || '').trim().replace(/^file:\/\//, '');
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) return;
    const path = isAbsolute(value) ? value : resolve(cwd || process.cwd(), value);
    try {
      if (statSync(path).isFile()) found.add(path);
    } catch {
      // Missing paths are not generated artifacts.
    }
  };
  const patterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,
    /<send-file\s+path=["']([^"']+)["'][^>]*>/gi,
    /\[SEND_FILE:\s*([^\s\]]+)\]/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) add(match[1]);
  }
  return [...found];
}

function createEventState() {
  return {
    sessionId: '',
    cwd: '',
    texts: [],
    final: null,
    errorEvent: null,
    events: [],
    ignoredLines: 0
  };
}

function ingestEventLine(rawLine, state) {
  const line = stripAnsi(rawLine).trim();
  if (!line) return null;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    state.ignoredLines += 1; // Diagnostics leaking onto stdout are not events.
    return null;
  }
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    state.ignoredLines += 1;
    return null;
  }
  state.events.push(event);
  switch (event.type) {
    case 'session':
      if (typeof event.sessionId === 'string' && event.sessionId) state.sessionId = event.sessionId;
      if (typeof event.cwd === 'string') state.cwd = event.cwd;
      break;
    case 'text':
      if (typeof event.text === 'string' && event.text.trim()) state.texts.push(event.text);
      break;
    case 'final':
      state.final = event;
      if (typeof event.sessionId === 'string' && event.sessionId) state.sessionId = event.sessionId;
      break;
    case 'error':
      state.errorEvent = event;
      break;
    default:
      break;
  }
  return event;
}

/** Split a byte stream into complete lines, keeping the trailing partial one. */
function createLineReader(onLine) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        onLine(line);
        index = buffer.indexOf('\n');
      }
    },
    flush() {
      const line = buffer.replace(/\r$/, '');
      buffer = '';
      if (line.trim()) onLine(line);
    }
  };
}

function replyTextFromState(state) {
  const finalText = state.final && typeof state.final.text === 'string' ? state.final.text : '';
  if (finalText.trim()) return finalText;
  return state.texts.join('\n');
}

function turnErrorFromState(state) {
  const reason = state.final && state.final.reason;
  if (!reason || typeof reason !== 'object' || reason.kind !== 'error') return null;
  const detail = reason.error && typeof reason.error === 'object' ? reason.error : {};
  const message = typeof detail.message === 'string' && detail.message
    ? detail.message
    : typeof reason.message === 'string' && reason.message
      ? reason.message
      : 'dsh turn failed';
  const error = new Error(message);
  error.code = detail.code || 'TURN_FAILED';
  error.reason = reason;
  return error;
}

function summarizeEvents(state) {
  return {
    sessionId: state.sessionId,
    cwd: state.cwd,
    replyText: replyTextFromState(state),
    final: state.final,
    errorEvent: state.errorEvent,
    events: state.events,
    ignoredLines: state.ignoredLines
  };
}

/**
 * Parse a complete `dsh --json` stream (one JSON object per line).
 * Non-JSON lines are counted in `ignoredLines` instead of failing the turn.
 */
export function parseDshEventStream(stdout) {
  const state = createEventState();
  const reader = createLineReader((line) => ingestEventLine(line, state));
  reader.push(String(stdout || ''));
  reader.flush();
  return summarizeEvents(state);
}

function processFailureError(result, timeoutMs) {
  if (result.timedOut) {
    const error = new Error(`dsh turn timed out after ${timeoutMs}ms`);
    error.code = 'ETIMEDOUT';
    error.stderr = result.stderr;
    return error;
  }
  const eventMessage = result.state?.errorEvent && typeof result.state.errorEvent.message === 'string'
    ? result.state.errorEvent.message
    : '';
  const detail = result.stderr.trim() || eventMessage;
  const error = new Error(detail ? detail.slice(0, 2000) : `dsh exited with code ${result.code}`);
  error.code = result.code;
  error.stderr = result.stderr;
  if (result.state?.errorEvent) error.event = result.state.errorEvent;
  return error;
}

export class DshAdapter extends AgentRuntimeAdapter {
  constructor(options = {}) {
    const cliPath = defaultCliPath(options);
    super({ name: 'dsh', defaultCliPath: cliPath });
    this.cliPath = cliPath;
    this.options = options;
    this.env = options.env || cleanEnvironment();
    this.profile = options.profile || DEFAULT_PROFILE;
    this.permissionMode = options.permissionMode || options.permission_mode || DEFAULT_PERMISSION_MODE;
    this.approvalPolicy = options.approvalPolicy || options.approval_policy || DEFAULT_APPROVAL_POLICY;
    this.turnTimeoutMs = Number(options.turnTimeoutMs) > 0 ? Number(options.turnTimeoutMs) : DEFAULT_TIMEOUT_MS;
    this.supportsModelFlag = options.supportsModelFlag === true;
    this.supportsEffortFlag = options.supportsEffortFlag === true;
    this.retryOnResumeFailure = options.retryOnResumeFailure !== false;
    this.extraTurnArgs = Array.isArray(options.extraTurnArgs) ? [...options.extraTurnArgs] : [];
    this.sessions = new Map();
    this.activeChildren = new Set();
  }

  async executeTurn(params = {}) {
    const {
      prompt,
      cwd,
      model = '',
      effort = '',
      threadId = '',
      attachments = [],
      onThread,
      roomId = ''
    } = params;

    const text = typeof prompt === 'string' ? prompt : String(prompt ?? '');
    const workdir = resolveCwd(cwd);
    if (workdir.error) {
      return { replyText: '', generatedFiles: [], error: workdir.error, threadId: threadId || '' };
    }
    if (!text.trim()) {
      return {
        replyText: '',
        generatedFiles: [],
        error: new Error('DshAdapter.executeTurn requires a non-empty prompt'),
        threadId: threadId || ''
      };
    }

    try {
      const turn = {
        prompt: promptWithAttachments(text, attachments),
        cwd: workdir.path,
        model,
        effort,
        threadId: threadId || ''
      };

      let result = await this._runTurn(turn);
      if (result.code !== 0 && turn.threadId && this.retryOnResumeFailure && this._looksLikeMissingSession(result)) {
        // `/new` may race a deleted/archived DSH Session: start a fresh one
        // instead of failing every later turn in the room.
        result = await this._runTurn({ ...turn, threadId: '' });
      }

      const summary = summarizeEvents(result.state);
      const nextThreadId = summary.sessionId || turn.threadId || '';

      if (result.code !== 0) {
        return {
          replyText: '',
          generatedFiles: [],
          error: processFailureError(result, this.turnTimeoutMs),
          threadId: nextThreadId
        };
      }

      const turnError = turnErrorFromState(result.state);
      if (turnError) {
        turnError.stderr = result.stderr;
        return {
          replyText: summary.replyText,
          generatedFiles: scanGeneratedFiles(summary.replyText, workdir.path),
          error: turnError,
          threadId: nextThreadId
        };
      }

      if (nextThreadId && typeof onThread === 'function') await onThread(nextThreadId);
      if (roomId && nextThreadId) {
        if (!this.sessions.has(roomId)) this.sessions.set(roomId, new Set());
        this.sessions.get(roomId).add(nextThreadId);
      }
      return {
        replyText: summary.replyText,
        generatedFiles: scanGeneratedFiles(summary.replyText, workdir.path),
        error: null,
        threadId: nextThreadId
      };
    } catch (error) {
      return {
        replyText: '',
        generatedFiles: [],
        error: error instanceof Error ? error : new Error(String(error)),
        threadId: threadId || ''
      };
    }
  }

  _looksLikeMissingSession(result) {
    const text = `${result.stderr || ''}\n${result.state?.errorEvent?.message || ''}`;
    return MISSING_SESSION_PATTERN.test(text);
  }

  _runTurn({ prompt, cwd, model, effort, threadId }) {
    const args = [
      '--profile', this.profile,
      '--json',
      '--permission-mode', this.permissionMode,
      '--approval-policy', this.approvalPolicy
    ];
    if (threadId) args.push('--session-id', String(threadId));
    if (this.supportsModelFlag && model) args.push('--model', String(model));
    if (this.supportsEffortFlag && effort) args.push('--reasoning-effort', String(effort));
    args.push(...this.extraTurnArgs);
    args.push(prompt);
    return this._spawnProcess(args, { cwd, timeoutMs: this.turnTimeoutMs });
  }

  _spawnProcess(args, { cwd, timeoutMs } = {}) {
    return new Promise((resolvePromise) => {
      const state = createEventState();
      let child;
      try {
        child = spawn(this.cliPath, args, {
          cwd,
          env: this.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) {
        resolvePromise({ code: -1, stdout: '', stderr: error.message, error, timedOut: false, state });
        return;
      }

      this.activeChildren.add(child);
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer;

      const reader = createLineReader((line) => ingestEventLine(line, state));
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeChildren.delete(child);
        reader.flush();
        resolvePromise({ ...result, state });
      };

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (stdout.length < MAX_PROCESS_OUTPUT) {
          stdout += text;
          reader.push(text);
        }
      });
      child.stderr?.on('data', (chunk) => {
        if (stderr.length < MAX_PROCESS_OUTPUT) stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => finish({
        code: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        error,
        timedOut: false
      }));
      child.on('close', (code, signal) => finish({ code: code ?? -1, stdout, stderr, signal, timedOut: false }));

      if (Number(timeoutMs) > 0) {
        timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
          finish({ code: -1, stdout, stderr: `${stderr}\ndsh timed out after ${timeoutMs}ms`.trim(), timedOut: true });
        }, Number(timeoutMs));
        if (typeof timer.unref === 'function') timer.unref();
      }
    });
  }

  async listAvailableModels() {
    const configured = Array.isArray(this.options.models) && this.options.models.length > 0
      ? this.options.models
      : FALLBACK_MODELS;
    const models = configured
      .map((entry) => {
        if (typeof entry === 'string') return { id: entry, name: entry, description: '' };
        if (!entry || typeof entry !== 'object') return null;
        const id = entry.id || entry.name;
        if (!id) return null;
        return {
          id: String(id),
          name: String(entry.name || entry.label || entry.displayName || id),
          description: String(entry.description || '')
        };
      })
      .filter(Boolean);
    const efforts = Array.isArray(this.options.efforts)
      ? [...new Set(this.options.efforts.filter((value) => typeof value === 'string' && value))]
      : [];
    return { models, efforts };
  }

  async resetSession(roomId, threadId) {
    const room = String(roomId || '');
    const thread = String(threadId || '');
    if (thread) {
      const sessions = this.sessions.get(room);
      if (sessions) {
        sessions.delete(thread);
        if (sessions.size === 0) this.sessions.delete(room);
      } else {
        this.sessions.delete(room);
      }
    } else {
      this.sessions.delete(room);
    }
    // Persisted DSH Session logs are owned by the runtime; `/new` only forgets
    // the resume token here.
    if (typeof this.options.onReset === 'function') await this.options.onReset(roomId, threadId);
  }

  /** Kill any in-flight `dsh` child (host shutdown / tests). */
  close() {
    for (const child of this.activeChildren) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    this.activeChildren.clear();
  }
}

export { FALLBACK_MODELS as DSH_FALLBACK_MODELS };
export default DshAdapter;
