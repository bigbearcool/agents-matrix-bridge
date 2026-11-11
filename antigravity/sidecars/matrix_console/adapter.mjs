/**
 * Antigravity adapter for @matrix-bridge/core.
 *
 * Antigravity exposes the `agy` CLI.  Headless turns use:
 *   agy --output-format=json --dangerously-skip-permissions \
 *       [--model=<id>] [--effort=<level>] [--conversation=<id>] \
 *       --print=<prompt>
 *
 * The JSON payload carries `conversation_id` (resume token) and `response`.
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { AgentRuntimeAdapter } from './core/adapter.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MODEL_TIMEOUT_MS = 8_000;
const MAX_PROCESS_OUTPUT = 10 * 1024 * 1024;

const FALLBACK_MODELS = Object.freeze([
  { id: 'gemini-4-carbon-high', name: 'Gemini 4 Carbon (High)', description: 'Highest quality Gemini 4 Carbon.' },
  { id: 'gemini-4-carbon-medium', name: 'Gemini 4 Carbon (Medium)', description: 'Balanced Gemini 4 Carbon.' },
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)', description: 'Highest quality Gemini 4 Argon.' },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', description: 'Fast Gemini 3.8 with high reasoning.' },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)', description: 'Claude Opus with high reasoning.' },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)', description: 'Claude Sonnet with high reasoning.' }
]);

const FALLBACK_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

function stripAnsi(value) {
  return String(value || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const SIDECAR_ENV_KEYS = Object.freeze([
  'ANTIGRAVITY_SIDECAR_WEB_PORT',
  'ANTIGRAVITY_SIDECAR_UI_TOKEN',
  'ANTIGRAVITY_CONVERSATION_ID',
  'ANTIGRAVITY_PROJECT_ID',
  'ANTIGRAVITY_LS_ADDRESS',
  'ANTIGRAVITY_CSRF_TOKEN',
  'ANTIGRAVITY_AGENTAPI_EXE',
  'MATRIX_ACCESS_TOKEN'
]);

function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of SIDECAR_ENV_KEYS) delete env[key];
  if (!env.LANG) env.LANG = 'en_US.UTF-8';
  env.NO_COLOR = '1';
  return env;
}

function parseJsonLoose(text) {
  const raw = stripAnsi(text).trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* scan below */ }
  for (const line of raw.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue;
    try { return JSON.parse(candidate); } catch { /* continue */ }
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* ignore */ }
  }
  return null;
}

function replyFromPayload(payload, raw) {
  if (payload && typeof payload === 'object') {
    for (const key of ['response', 'result', 'text', 'content', 'message']) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (value != null && typeof value !== 'object') return String(value);
    }
  }
  return stripAnsi(raw).trim();
}

function threadIdFromPayload(payload, fallback = '') {
  if (!payload || typeof payload !== 'object') return fallback;
  for (const key of ['conversation_id', 'conversationId', 'sessionId', 'session_id', 'threadId']) {
    const value = payload[key];
    if (typeof value === 'string' && value) return value;
  }
  return fallback;
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

/**
 * Scan a reply for [SEND_FILE: ...], <send-file .../> and Markdown images.
 * Relative paths resolve against the room workspace.
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

function appendAttachmentHints(prompt, attachments) {
  const lines = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const path = attachmentPath(attachment);
    if (!path || prompt.includes(path)) continue;
    lines.push(`- ${path}${attachment?.type ? ` (${attachment.type})` : ''}`);
  }
  if (lines.length === 0) return prompt;
  return `${prompt}\n\n[附件]\n${lines.join('\n')}`;
}

export class AntigravityAdapter extends AgentRuntimeAdapter {
  constructor(options = {}) {
    const cliPath = options.defaultCliPath || options.cliPath || options.agyCmd || options.agy_cmd || 'agy';
    super({ name: 'antigravity', defaultCliPath: cliPath });
    this.cliPath = cliPath;
    this.options = options;
    this.env = options.env || cleanEnvironment();
    this.turnTimeoutMs = Number(options.turnTimeoutMs) > 0 ? Number(options.turnTimeoutMs) : DEFAULT_TIMEOUT_MS;
    this.modelTimeoutMs = Number(options.modelTimeoutMs) > 0 ? Number(options.modelTimeoutMs) : DEFAULT_MODEL_TIMEOUT_MS;
    this.modelCacheMs = Number(options.modelCacheMs) >= 0 ? Number(options.modelCacheMs) : 5 * 60_000;
    this.modelArgs = Array.isArray(options.modelArgs) ? [...options.modelArgs] : ['models'];
    this.extraTurnArgs = Array.isArray(options.extraTurnArgs) ? [...options.extraTurnArgs] : [];
    this.defaultModel = options.defaultModel || '';
    this.defaultEffort = options.defaultEffort || '';
    this.retryOnResumeFailure = options.retryOnResumeFailure !== false;
    this.catalog = null;
    this.catalogAt = 0;
    this.catalogPromise = null;
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

    const rawPrompt = typeof prompt === 'string' ? prompt : String(prompt ?? '');
    const workdir = resolveCwd(cwd);
    if (workdir.error) {
      return { replyText: '', generatedFiles: [], error: workdir.error, threadId: threadId || '' };
    }
    if (!rawPrompt.trim()) {
      return {
        replyText: '',
        generatedFiles: [],
        error: new Error('AntigravityAdapter.executeTurn requires a non-empty prompt'),
        threadId: threadId || ''
      };
    }

    const finalPrompt = appendAttachmentHints(rawPrompt, attachments);
    const effectiveModel = model || this.defaultModel;
    const effectiveEffort = effort || this.defaultEffort;

    try {
      let result = await this._runTurn({
        prompt: finalPrompt,
        cwd: workdir.path,
        model: effectiveModel,
        effort: effectiveEffort,
        threadId: threadId || ''
      });

      // An expired/invalid conversation id must not wedge a room. Start a
      // fresh conversation and retry exactly once.
      if (result.code !== 0 && threadId && this.retryOnResumeFailure) {
        result = await this._runTurn({
          prompt: finalPrompt,
          cwd: workdir.path,
          model: effectiveModel,
          effort: effectiveEffort,
          threadId: ''
        });
      }

      if (result.code !== 0) {
        const error = new Error(
          result.timedOut
            ? `agy turn timed out after ${this.turnTimeoutMs}ms`
            : (result.stderr.trim() || result.stdout.trim() || `agy exited with code ${result.code}`).slice(0, 2000)
        );
        error.code = result.timedOut ? 'ETIMEDOUT' : result.code;
        error.stderr = result.stderr;
        return { replyText: '', generatedFiles: [], error, threadId: threadId || '' };
      }

      const payload = parseJsonLoose(result.stdout);
      const replyText = replyFromPayload(payload, result.stdout);
      const nextThreadId = threadIdFromPayload(payload, threadId || '');
      if (nextThreadId && typeof onThread === 'function') await onThread(nextThreadId);
      if (roomId && nextThreadId) {
        if (!this.sessions.has(roomId)) this.sessions.set(roomId, new Set());
        this.sessions.get(roomId).add(nextThreadId);
      }
      return {
        replyText,
        generatedFiles: scanGeneratedFiles(replyText, workdir.path),
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

  _runTurn({ prompt, cwd, model, effort, threadId }) {
    const args = ['--output-format=json', '--dangerously-skip-permissions'];
    if (this.options.disableSlashCommands) args.push('--disable-slash-commands');
    if (this.options.mode) args.push(`--mode=${this.options.mode}`);
    if (model) args.push(`--model=${model}`);
    if (effort) args.push(`--effort=${effort}`);
    if (threadId) args.push(`--conversation=${threadId}`);
    args.push(...this.extraTurnArgs);
    args.push(`--print=${prompt}`);

    return this._spawnProcess(args, { cwd, timeoutMs: this.turnTimeoutMs });
  }

  _spawnProcess(args, { cwd, timeoutMs, env } = {}) {
    return new Promise((resolvePromise) => {
      let child;
      try {
        child = spawn(this.cliPath, args, {
          cwd,
          env: env || this.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) {
        resolvePromise({ code: -1, stdout: '', stderr: error.message, error, timedOut: false });
        return;
      }

      this.activeChildren.add(child);
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeChildren.delete(child);
        resolvePromise(result);
      };

      child.stdout?.on('data', (chunk) => {
        if (stdout.length < MAX_PROCESS_OUTPUT) stdout += chunk.toString('utf8');
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
          finish({ code: -1, stdout, stderr: `${stderr}\nagy timed out after ${timeoutMs}ms`.trim(), timedOut: true });
        }, Number(timeoutMs));
        if (typeof timer.unref === 'function') timer.unref();
      }
    });
  }

  async listAvailableModels() {
    if (Array.isArray(this.options.models) && this.options.models.length > 0) {
      return {
        models: this.options.models.map((entry) => {
          if (typeof entry === 'string') return { id: entry, name: entry, description: '' };
          const id = entry.id || entry.slug || entry.name;
          return {
            id: String(id || ''),
            name: String(entry.name || entry.label || entry.displayName || id || ''),
            description: String(entry.description || '')
          };
        }).filter((entry) => entry.id),
        efforts: Array.isArray(this.options.efforts) && this.options.efforts.length
          ? [...new Set(this.options.efforts.map(String))]
          : [...FALLBACK_EFFORTS]
      };
    }

    const fresh = this.catalog && (Date.now() - this.catalogAt) < this.modelCacheMs;
    if (fresh) return this.catalog;
    if (this.catalogPromise) return this.catalogPromise;

    this.catalogPromise = (async () => {
      let catalog = { models: [...FALLBACK_MODELS], efforts: [...FALLBACK_EFFORTS] };
      try {
        const result = await this._spawnProcess(this.modelArgs, {
          cwd: this.options.cwd,
          timeoutMs: this.modelTimeoutMs
        });
        if (result.code === 0 && result.stdout.trim()) {
          const models = [];
          for (const rawLine of stripAnsi(result.stdout).split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;
            if (/^[IEW]\d{3,4}\s/.test(line)) continue;
            if (/^(Fetching|Loading|Using|Available|ERROR|WARN|INFO)\b/i.test(line)) continue;
            if (/^\[/.test(line) || /https?:\/\//i.test(line)) continue;
            const match = line.match(/^([a-zA-Z0-9][a-zA-Z0-9._/-]*)\s+(.+)$/);
            if (!match) continue;
            models.push({
              id: match[1].trim(),
              name: match[2].trim(),
              description: ''
            });
          }
          if (models.length > 0) catalog = { models, efforts: [...FALLBACK_EFFORTS] };
        }
      } catch {
        // Fall back to the static catalog; the CLI may need auth or be absent.
      }
      this.catalog = catalog;
      this.catalogAt = Date.now();
      return catalog;
    })().finally(() => {
      this.catalogPromise = null;
    });

    return this.catalogPromise;
  }

  clearModelCache() {
    this.catalog = null;
    this.catalogAt = 0;
    this.catalogPromise = null;
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
    if (typeof this.options.onReset === 'function') await this.options.onReset(roomId, threadId);
  }

  /** Kill any in-flight `agy` child (host shutdown / tests). */
  close() {
    for (const child of this.activeChildren) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    this.activeChildren.clear();
  }
}

export { FALLBACK_EFFORTS as ANTIGRAVITY_FALLBACK_EFFORTS, FALLBACK_MODELS as ANTIGRAVITY_FALLBACK_MODELS };
export default AntigravityAdapter;
