/**
 * Codex adapter for @matrix-bridge/core.
 *
 * Codex is driven through its long-lived app-server (stdio JSON-RPC) so that
 * approvals and user-input requests can round-trip to Matrix.  `client.mjs`
 * owns the protocol; this file only adapts it to the AgentRuntimeAdapter
 * contract.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { AgentRuntimeAdapter } from './core/adapter.mjs';
import { CodexClient } from './client.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MODEL_TIMEOUT_MS = 10_000;
const MAX_COMMAND_OUTPUT = 8 * 1024 * 1024;

const FALLBACK_MODELS = Object.freeze([
  { id: 'gpt-6.1-sol', name: 'GPT-6.1-Sol', description: 'Latest workhorse model for coding and everyday work.' },
  { id: 'gpt-6-astra', name: 'GPT-6-Astra', description: 'High-capability model for complex work.' },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', description: 'Balanced model for everyday coding.' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol', description: 'Previous generation workhorse model.' }
]);

const FALLBACK_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

function cleanEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.MATRIX_ACCESS_TOKEN;
  if (!env.LANG) env.LANG = 'en_US.UTF-8';
  env.NO_COLOR = '1';
  return env;
}

function runCommand(command, args, { cwd, env, timeoutMs = DEFAULT_MODEL_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: cwd && existsSync(cwd) ? cwd : undefined,
        env: env || cleanEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      resolvePromise({ code: -1, stdout: '', stderr: error.message, error });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < MAX_COMMAND_OUTPUT) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < MAX_COMMAND_OUTPUT) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish({ code: -1, stdout, stderr: `${stderr}\n${error.message}`.trim(), error }));
    child.on('close', (code, signal) => finish({ code: code ?? -1, stdout, stderr, signal }));

    if (Number(timeoutMs) > 0) {
      timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        const killer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }, 1000);
        if (typeof killer.unref === 'function') killer.unref();
        finish({ code: -1, stdout, stderr: `${stderr}\ncommand timed out after ${timeoutMs}ms`.trim(), timeout: true });
      }, Number(timeoutMs));
      if (typeof timer.unref === 'function') timer.unref();
    }
  });
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Commands occasionally prefix warnings/log lines before the JSON body.
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* ignore */ }
    }
    return null;
  }
}

function resolveCwd(rawCwd) {
  if (!rawCwd) return { path: process.cwd() };
  const path = resolve(String(rawCwd));
  try {
    if (!statSync(path).isDirectory()) {
      return { error: new Error(`cwd is not a directory: ${path}`) };
    }
  } catch {
    return { error: new Error(`cwd does not exist: ${path}`) };
  }
  return { path };
}

/**
 * Scan an agent reply for the bridge's file hand-off conventions.
 * Relative paths are resolved against the room workspace and only existing
 * regular files are returned.
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
      // Missing/non-regular file: not a generated artifact.
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

export class CodexAdapter extends AgentRuntimeAdapter {
  constructor(options = {}) {
    const cliPath = options.defaultCliPath || options.cliPath || options.codexCmd || options.codex_cmd || 'codex';
    super({ name: 'codex', defaultCliPath: cliPath });
    this.cliPath = cliPath;
    this.options = options;
    this.env = options.env || cleanEnvironment();
    // config.json uses snake_case (codex_home); accept both spellings so existing sessions stay reachable.
    const codexHome = options.codexHome || options.codex_home;
    if (codexHome && !this.env.CODEX_HOME) this.env = { ...this.env, CODEX_HOME: codexHome };
    this.clientOptions = {
      command: cliPath,
      appServerArgs: options.appServerArgs,
      env: this.env,
      spawnOptions: options.spawnOptions,
      requestTimeoutMs: options.requestTimeoutMs,
      turnTimeoutMs: options.turnTimeoutMs || DEFAULT_TIMEOUT_MS,
      clientInfo: options.clientInfo
    };
    this.clientFactory = typeof options.clientFactory === 'function'
      ? options.clientFactory
      : () => new CodexClient(this.clientOptions);
    this.client = null;
    this.modelArgs = Array.isArray(options.modelArgs) ? [...options.modelArgs] : ['debug', 'models'];
    this.modelTimeoutMs = Number(options.modelTimeoutMs) > 0 ? Number(options.modelTimeoutMs) : DEFAULT_MODEL_TIMEOUT_MS;
    this.modelCacheMs = Number(options.modelCacheMs) >= 0 ? Number(options.modelCacheMs) : 5 * 60_000;
    this.catalog = null;
    this.catalogAt = 0;
    this.catalogPromise = null;
    this.sessions = new Map();
  }

  _getClient() {
    if (this.client && !this.client.closed) return this.client;
    this.client = this.clientFactory();
    return this.client;
  }

  async executeTurn(params = {}) {
    const {
      prompt,
      cwd,
      model = '',
      effort = '',
      threadId = '',
      attachments = [],
      onApproval,
      onInput,
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
        error: new Error('CodexAdapter.executeTurn requires a non-empty prompt'),
        threadId: threadId || ''
      };
    }

    let client;
    try {
      client = this._getClient();
      const result = await client.turn({
        threadId: threadId || '',
        cwd: workdir.path,
        text,
        attachments,
        model,
        effort,
        onThread,
        onApproval,
        onInput
      });
      const generatedFiles = [...new Set([
        ...(Array.isArray(result.generatedFiles) ? result.generatedFiles : []),
        ...scanGeneratedFiles(result.text, workdir.path)
      ])];
      const nextThreadId = result.threadId || threadId || '';
      if (roomId && nextThreadId) {
        if (!this.sessions.has(roomId)) this.sessions.set(roomId, new Set());
        this.sessions.get(roomId).add(nextThreadId);
      }
      return {
        replyText: result.text || '',
        generatedFiles,
        error: null,
        threadId: nextThreadId
      };
    } catch (error) {
      if (client?.closed) this.client = null;
      return {
        replyText: '',
        generatedFiles: [],
        error: error instanceof Error ? error : new Error(String(error)),
        threadId: threadId || ''
      };
    }
  }

  async listAvailableModels() {
    if (Array.isArray(this.options.models) && this.options.models.length > 0) {
      return {
        models: this.options.models.map((entry) => {
          if (typeof entry === 'string') return { id: entry, name: entry, description: '' };
          return {
            id: String(entry.id || entry.slug || entry.name || ''),
            name: String(entry.name || entry.displayName || entry.display_name || entry.id || entry.slug || ''),
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
        const result = await runCommand(this.cliPath, this.modelArgs, {
          cwd: this.options.cwd,
          env: this.env,
          timeoutMs: this.modelTimeoutMs
        });
        if (result.code === 0 && result.stdout.trim()) {
          const parsed = parseJsonLoose(result.stdout);
          const rows = Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : [];
          const models = [];
          const efforts = new Set();
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const id = row.slug || row.id || row.model;
            if (!id) continue;
            models.push({
              id: String(id),
              name: String(row.display_name || row.displayName || row.name || row.label || id),
              description: String(row.description || '')
            });
            const levels = row.supported_reasoning_levels || row.supportedReasoningLevels || row.efforts || [];
            if (Array.isArray(levels)) {
              for (const level of levels) {
                const value = typeof level === 'string' ? level : level?.effort || level?.id;
                if (typeof value === 'string' && value) efforts.add(value);
              }
            }
          }
          if (models.length > 0) {
            catalog = {
              models,
              efforts: efforts.size > 0 ? [...efforts] : [...FALLBACK_EFFORTS]
            };
          }
        }
      } catch {
        // Keep the fallback catalog: a missing/unauthorized CLI must not break /model.
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
    if (typeof this.options.onReset === 'function') {
      await this.options.onReset(roomId, threadId);
    }
  }

  /** Close the underlying app-server child (used by tests and host shutdown). */
  close() {
    if (this.client && typeof this.client.close === 'function') this.client.close();
    this.client = null;
  }
}

export { FALLBACK_EFFORTS as CODEX_FALLBACK_EFFORTS, FALLBACK_MODELS as CODEX_FALLBACK_MODELS };
export default CodexAdapter;
