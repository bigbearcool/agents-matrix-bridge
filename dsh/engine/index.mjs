/**
 * dsh-matrix-bridge — DeepSeek Harness (DSH) desktop plugin entry.
 *
 * DSH composes its desktop profile as an ordered bundle stack (Cordis). This
 * package's `dsh.bundle.patch` inserts one row; when the host mounts that row
 * Cordis calls {@link apply} with the plugin context. The plugin then:
 *
 *   1. loads ~/.dsh/matrix-bridge/config.json (or the `config` object on the
 *      Cordis row, which wins over the file),
 *   2. creates a {@link Bridge} driven by {@link DshAdapter} — every Matrix
 *      turn runs `dsh --profile headless …`, so the desktop UI and the bridge
 *      never share a live turn, and
 *   3. serves the unified management console on 127.0.0.1:47616.
 *
 * `workspaceRegistry` supplies the default working directory (the first
 * registered project) when neither the file nor the row sets one. The
 * `sessionController` / `sessionQuery` services are injected because the row
 * belongs on the desktop host plane; headless turns happen in their own
 * process and never drive the live desktop sessions.
 *
 * Teardown goes through `ctx.effect`: a live profile patch reload disposes the
 * effect, which stops Matrix sync, kills in-flight `dsh` children and closes
 * the console listener.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge, createConsole } from './core/index.mjs';
import { DshAdapter } from './adapter.mjs';

export const name = 'dsh-matrix-bridge';
export const inject = [];
export const DEFAULT_CONSOLE_PORT = 47616;

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_PREFIX = '[DSH Matrix Bridge]';

export const DEFAULT_CONFIG = Object.freeze({
  homeserver: 'https://matrix.bigbear.cool:8443',
  user_id: '@bot:matrix.bigbear.cool',
  admins: ['@xiangyu:matrix.bigbear.cool'],
  allowed_senders: ['*'],
  direct_rooms: [],
  cwd: '',
  auto_connect: true,
  console_port: DEFAULT_CONSOLE_PORT
});

/** `$DSH_HOME` when set, `~/.dsh` otherwise — the same root the CLI uses. */
export function dshHome() {
  const configured = String(process.env.DSH_HOME || '').trim();
  return configured ? resolve(configured) : join(homedir(), '.dsh');
}

/** Bridge-owned data (config, state, logs) lives outside any single profile. */
export function dshBridgeDir() {
  return join(dshHome(), 'matrix-bridge');
}

export function defaultConfigPath() {
  return join(dshBridgeDir(), 'config.json');
}

export function defaultStatePath() {
  return join(dshBridgeDir(), 'state.json');
}

function createLogger(ctx) {
  try {
    if (ctx && typeof ctx.logger === 'function') return ctx.logger('dsh-matrix-bridge');
  } catch {
    // Fall through to the process console.
  }
  return console;
}

function readConfigFile(configPath, logger) {
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn?.(`${LOG_PREFIX} 读取配置失败，使用默认值: ${error.message}`);
    }
    return {};
  }
}

function explicitConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
}

/**
 * First registered DSH project, usable as the bridge's default workspace.
 * Records have appeared as `directory` (current) and `path` (older hosts), so
 * read both and ignore anything that is not an absolute path.
 */
function workspaceDirectory(registry) {
  if (!registry || typeof registry.list !== 'function') return '';
  try {
    const entries = registry.list();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const candidate = entry?.directory || entry?.path || entry?.cwd;
      if (typeof candidate === 'string' && candidate && isAbsolute(candidate)) return candidate;
    }
  } catch {
    // Registry not ready yet: fall back to the config/home directory.
  }
  return '';
}

function consoleStaticDir(options) {
  if (options.staticDir !== undefined) return options.staticDir || '';
  const bundled = join(HERE, 'console');
  return existsSync(join(bundled, 'index.html')) ? bundled : '';
}

/**
 * Start the bridge and its console without requiring a Cordis context. Exported
 * so `engine/main.mjs`, tests and other hosts can embed the plugin directly.
 *
 * @param {object} [ctx]   Cordis plugin context (may be a stub with `get`).
 * @param {object} [config] Row config from `cordis.patch.yml`.
 * @param {object} [options] `configPath`, `staticDir`, `cwd`, `port`, `adapter`, `logger`.
 */
export function startBridge(ctx = {}, config = {}, options = {}) {
  const logger = options.logger || createLogger(ctx);
  const configPath = options.configPath || defaultConfigPath();
  const merged = {
    ...DEFAULT_CONFIG,
    ...readConfigFile(configPath, logger),
    ...explicitConfig(config)
  };

  try {
    mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  } catch (error) {
    logger.warn?.(`${LOG_PREFIX} 创建配置目录失败: ${error.message}`);
  }

  const port = Number(options.port ?? merged.console_port ?? DEFAULT_CONSOLE_PORT) || DEFAULT_CONSOLE_PORT;
  const registry = typeof ctx?.get === 'function' ? ctx.get('workspaceRegistry') : undefined;
  const cwd = options.cwd || merged.cwd || workspaceDirectory(registry) || homedir();
  const bridgeConfig = { ...merged, cwd };

  const adapter = options.adapter || new DshAdapter({
    cliPath: merged.dsh_cmd || merged.cliPath || merged.agent_cli_cmd,
    profile: merged.dsh_profile,
    permissionMode: merged.permission_mode,
    approvalPolicy: merged.approval_policy,
    turnTimeoutMs: merged.turn_timeout_ms,
    retryOnResumeFailure: merged.retry_on_resume_failure !== false,
    models: merged.models,
    efforts: merged.efforts
  });

  let token = merged.access_token || process.env.MATRIX_ACCESS_TOKEN || '';
  if (!token) {
    const tokenFile = join(dirname(configPath), 'token');
    if (existsSync(tokenFile)) {
      try {
        token = readFileSync(tokenFile, 'utf8').trim();
      } catch {}
    }
  }

  const bridge = new Bridge({
    config: bridgeConfig,
    adapter,
    token,
    statePath: merged.state_path || defaultStatePath()
  });

  const server = createConsole(bridge, configPath, port, {
    staticDir: consoleStaticDir(options),
    allowedOrigins: ['dsh-desktop://app', 'dsh-desktop://console', 'null']
  });
  server.on('error', (error) => {
    logger.error?.(`${LOG_PREFIX} 控制台监听失败 (127.0.0.1:${port}): ${error.message}`);
  });
  const ready = new Promise((resolveReady, rejectReady) => {
    server.once('error', rejectReady);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', rejectReady);
      logger.info?.(`${LOG_PREFIX} 控制台已就绪: http://127.0.0.1:${port}/`);
      resolveReady();
    });
  });
  ready.catch(() => {
    // Logged by the persistent listener above; callers that embed the engine
    // (engine/main.mjs) await `ready` when they need to fail fast.
  });

  let stopped = false;
  const autoConnect = options.autoConnect !== false && bridgeConfig.auto_connect !== false;

  ready.then(() => {
    if (autoConnect && bridge.token && !stopped) {
      bridge.run().catch((error) => {
        logger.warn?.(`${LOG_PREFIX} Matrix 自动连接异常: ${error.message}`);
      });
    }
  }).catch((error) => {
    if (error?.code === 'EADDRINUSE') {
      logger.warn?.(`${LOG_PREFIX} 端口 ${port} 已被其他实例占用，本实例保持待命。`);
      handle.stop();
    }
  });

  const handle = {
    bridge,
    adapter,
    server,
    ready,
    config: bridgeConfig,
    configPath,
    port,
    stop() {
      stopped = true;
      try { bridge.stop(); } catch { /* already stopped */ }
      try { server.close(); } catch { /* already closed */ }
    }
  };
  return handle;
}

/**
 * Cordis plugin entry. A failure to start must never take down the desktop
 * host, so startup errors are logged and the row simply stays inert.
 */
export function apply(ctx, config) {
  let handle;
  try {
    handle = startBridge(ctx, config);
  } catch (error) {
    createLogger(ctx).error?.(`${LOG_PREFIX} 启动失败: ${error.message}`);
    return;
  }
  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => () => handle.stop(), 'dsh-matrix-bridge lifecycle');
  } else if (typeof ctx?.on === 'function') {
    // Non-Cordis hosts that hand us an event emitter can still release us.
    ctx.on('dispose', () => handle.stop());
  }
  // No return value: Cordis treats a plugin's return value as an effect, and
  // an arbitrary object there aborts the mount.
}
