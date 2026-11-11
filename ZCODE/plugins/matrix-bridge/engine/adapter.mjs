/**
 * ZCode adapter for @matrix-bridge/core.
 *
 * ZCode runs headless turns through:
 *   zcode --prompt=<text> --json [--resume <sess_id>] [--attach <path>]
 *
 * JSON output exposes `sessionId` (resume token) and `response`.  ZCode does
 * not currently expose per-turn model/effort flags, so those parameters are
 * accepted for contract compatibility but ignored unless the host explicitly
 * enables them via `supportsModelFlag` / `supportsEffortFlag`.
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { AgentRuntimeAdapter } from './core/adapter.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MODEL_TIMEOUT_MS = 8_000;
const MAX_PROCESS_OUTPUT = 10 * 1024 * 1024;

const FALLBACK_MODELS = Object.freeze([
  { id: 'zai/glm-5', name: 'GLM-5 (Z.AI Flagship)', description: 'Z.AI flagship coding model.' },
  { id: 'zai/glm-4.5', name: 'GLM-4.5', description: 'Balanced GLM coding model.' },
  { id: 'zai/glm-4.5-air', name: 'GLM-4.5 Air (Fast)', description: 'Fast GLM model.' },
  { id: 'anthropic/claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', description: 'Anthropic Claude via ZCode.' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4o via ZCode.' }
]);

function stripAnsi(value) {
  return String(value || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.MATRIX_ACCESS_TOKEN;
  delete env.ZCODE_MATRIX_TOKEN;
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
  for (const key of ['sessionId', 'session_id', 'conversation_id', 'conversationId', 'threadId']) {
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

/** Scan a ZCode reply for bridge file hand-off markers. */
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

export class ZCodeAdapter extends AgentRuntimeAdapter {
  constructor(options = {}) {
    const cliPath = options.defaultCliPath || options.cliPath || options.zcodeCmd || options.zcode_cmd || 'zcode';
    super({ name: 'zcode', defaultCliPath: cliPath });
    this.cliPath = cliPath;
    this.options = options;
    this.env = options.env || cleanEnvironment();
    this.turnTimeoutMs = Number(options.turnTimeoutMs) > 0 ? Number(options.turnTimeoutMs) : DEFAULT_TIMEOUT_MS;
    this.modelTimeoutMs = Number(options.modelTimeoutMs) > 0 ? Number(options.modelTimeoutMs) : DEFAULT_MODEL_TIMEOUT_MS;
    this.modelCacheMs = Number(options.modelCacheMs) >= 0 ? Number(options.modelCacheMs) : 5 * 60_000;
    this.modelArgs = Array.isArray(options.modelArgs) ? [...options.modelArgs] : null;
    this.extraTurnArgs = Array.isArray(options.extraTurnArgs) ? [...options.extraTurnArgs] : [];
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

    const text = typeof prompt === 'string' ? prompt : String(prompt ?? '');
    const workdir = resolveCwd(cwd);
    if (workdir.error) {
      return { replyText: '', generatedFiles: [], error: workdir.error, threadId: threadId || '' };
    }
    if (!text.trim()) {
      return {
        replyText: '',
        generatedFiles: [],
        error: new Error('ZCodeAdapter.executeTurn requires a non-empty prompt'),
        threadId: threadId || ''
      };
    }

    try {
      let result = await this._runTurn({
        prompt: text,
        cwd: workdir.path,
        model,
        effort,
        threadId: threadId || '',
        attachments
      });

      if (result.code !== 0 && threadId && this.retryOnResumeFailure) {
        result = await this._runTurn({
          prompt: text,
          cwd: workdir.path,
          model,
          effort,
          threadId: '',
          attachments
        });
      }

      if (result.code !== 0) {
        const error = new Error(
          result.timedOut
            ? `zcode turn timed out after ${this.turnTimeoutMs}ms`
            : (result.stderr.trim() || result.stdout.trim() || `zcode exited with code ${result.code}`).slice(0, 2000)
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

  _runTurn({ prompt, cwd, model, effort, threadId, attachments }) {
    const args = ['-p', prompt, '--json'];
    if (this.options.mode) args.push(`--mode=${this.options.mode}`);
    if (this.options.supportsModelFlag && model) args.push(`--model=${model}`);
    if (this.options.supportsEffortFlag && effort) args.push(`--effort=${effort}`);
    if (threadId) args.push('--resume', threadId);
    for (const attachment of Array.isArray(attachments) ? attachments : []) {
      const path = attachmentPath(attachment);
      if (path) args.push('--attach', path);
    }
    args.push(...this.extraTurnArgs);

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
          finish({ code: -1, stdout, stderr: `${stderr}\nzcode timed out after ${timeoutMs}ms`.trim(), timedOut: true });
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
        efforts: Array.isArray(this.options.efforts)
          ? [...new Set(this.options.efforts.filter((value) => typeof value === 'string' && value))]
          : []
      };
    }

    if (Array.isArray(this.options.efforts)) {
      return {
        models: [...FALLBACK_MODELS],
        efforts: [...new Set(this.options.efforts.filter((value) => typeof value === 'string' && value))]
      };
    }

    if (!Array.isArray(this.modelArgs)) {
      return { models: [...FALLBACK_MODELS], efforts: [] };
    }

    const fresh = this.catalog && (Date.now() - this.catalogAt) < this.modelCacheMs;
    if (fresh) return this.catalog;
    if (this.catalogPromise) return this.catalogPromise;

    this.catalogPromise = (async () => {
      let catalog = { models: [...FALLBACK_MODELS], efforts: [] };
      try {
        const result = await this._spawnProcess(this.modelArgs, {
          cwd: this.options.cwd,
          timeoutMs: this.modelTimeoutMs
        });
        if (result.code === 0 && result.stdout.trim()) {
          const parsed = parseJsonLoose(result.stdout);
          const rows = Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : [];
          const models = [];
          const efforts = new Set();
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const id = row.id || row.slug || row.model;
            if (!id) continue;
            models.push({
              id: String(id),
              name: String(row.name || row.label || row.display_name || row.displayName || id),
              description: String(row.description || '')
            });
            for (const level of row.supported_reasoning_levels || row.efforts || []) {
              const value = typeof level === 'string' ? level : level?.effort || level?.id;
              if (typeof value === 'string' && value) efforts.add(value);
            }
          }
          for (const level of Array.isArray(parsed?.efforts) ? parsed.efforts : []) {
            if (typeof level === 'string' && level) efforts.add(level);
          }
          if (models.length > 0) catalog = { models, efforts: [...efforts] };
        }
      } catch {
        // Static fallback below.
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

  /** Kill any in-flight `zcode` child (host shutdown / tests). */
  close() {
    for (const child of this.activeChildren) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    this.activeChildren.clear();
  }
}

export { FALLBACK_MODELS as ZCODE_FALLBACK_MODELS };
export default ZCodeAdapter;
