#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge, createConsole } from './core/index.mjs';
import { AntigravityAdapter } from './adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(homedir(), '.gemini', 'config', 'plugins', 'matrix-bridge', 'config.json');
const ALT_CONFIG_PATH = join(homedir(), '.gemini', 'matrix-bot', 'config.json');

// Token lives in a separate 0600 file, never in config.json (AGENTS.md invariant 4).
// MATRIX_ACCESS_TOKEN env var remains as an explicit override.
function readToken(path) {
  if (process.env.MATRIX_ACCESS_TOKEN) return process.env.MATRIX_ACCESS_TOKEN;
  try { return readFileSync(path, 'utf-8').trim(); } catch { return ''; }
}
const TOKEN_PATH = join(homedir(), '.gemini', 'antigravity', 'plugin_data', 'matrix-bridge', 'token');

const configPath = existsSync(CONFIG_PATH) ? CONFIG_PATH : ALT_CONFIG_PATH;
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {
  homeserver: 'https://matrix.bigbear.cool:8443',
  user_id: '@bot:matrix.bigbear.cool',
  cwd: join(homedir(), '开发项目'),
  allowed_senders: ['*'],
  admins: ['@xiangyu:matrix.bigbear.cool'],
  direct_rooms: []
};

const adapter = new AntigravityAdapter({
  cliPath: config.agy_cmd || join(homedir(), '.local', 'bin', 'agy'),
  ...config
});

const bridge = new Bridge({
  config,
  adapter,
  token: readToken(TOKEN_PATH)
});

const port = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || config.console_port || 47612);

const server = createConsole(bridge, configPath, port, {
  staticDir: __dirname
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[Antigravity Matrix Bridge] Sidecar / 控制台已监听 http://127.0.0.1:${port}/`);
});

if (bridge.token && config.homeserver && config.auto_connect !== false) {
  bridge.run().catch(err => {
    console.warn('[Antigravity Matrix Bridge] 自动连接 Matrix 异常:', err.message);
  });
}

process.on('SIGTERM', () => { bridge.stop(); server.close(); });
process.on('SIGINT', () => { bridge.stop(); server.close(); });
