#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge, createConsole } from './core/index.mjs';
import { ClaudeAdapter } from './adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STABLE_DIR = join(homedir(), '.claude', 'matrix-bridge');
const CONFIG_PATH = join(STABLE_DIR, 'config.json');

const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) : {
  homeserver: 'https://matrix.bigbear.cool:8443',
  user_id: '@claude:matrix.bigbear.cool',
  cwd: join(homedir(), '开发项目'),
  allowed_senders: ['*'],
  admins: ['@xiangyu:matrix.bigbear.cool'],
  direct_rooms: []
};

const adapter = new ClaudeAdapter({
  cliPath: config.claude_cmd || '',
  ...config
});

let token = config.access_token || process.env.MATRIX_ACCESS_TOKEN || '';
if (!token && existsSync(join(STABLE_DIR, 'token'))) {
  try {
    token = readFileSync(join(STABLE_DIR, 'token'), 'utf-8').trim();
  } catch {}
}

const bridge = new Bridge({
  config,
  adapter,
  token
});

const port = Number(config.console_port || 47615);
const server = createConsole(bridge, CONFIG_PATH, port, {
  staticDir: join(__dirname, 'console'),
  allowedOrigins: ['claude-sandbox://test', 'claude-sandbox://app', 'claude-plugin://app', 'null']
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[Claude Matrix Bridge] 引擎守护进程已监听 http://127.0.0.1:${port}/`);
});

if (bridge.token && config.homeserver && config.auto_connect !== false) {
  bridge.run().catch(err => {
    console.warn('[Claude Matrix Bridge] 自动连接 Matrix 异常:', err.message);
  });
}

process.on('SIGTERM', () => { bridge.stop(); server.close(); });
process.on('SIGINT', () => { bridge.stop(); server.close(); });
