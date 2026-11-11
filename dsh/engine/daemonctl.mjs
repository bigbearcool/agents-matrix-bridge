#!/usr/bin/env node
// DSH Matrix Bridge — 守护进程管理器（LaunchAgent）
// 用法: node daemonctl.mjs <install|start|stop|restart|status|uninstall>
//
// 设计要点：
// - DSH 插件安装在带版本号的 profile node_modules 中，升级后路径会变化，
//   LaunchAgent 不能直接指向插件缓存。install 先把 engine/ 复制到稳定目录
//   ~/.dsh/matrix-bridge/engine/，再注册开机自启。
// - 插件升级后重新执行 install 即同步引擎代码；config/state/logs 不受影响。
// - 重启策略：服务已加载时一律用 kickstart 原地重启（每次启动现读引擎文件），
//   不走 bootout→bootstrap —— 域卸载是异步的，SSH/沙箱上下文对 gui 域操作受限，
//   容易触发 "Bootstrap failed: 125: Domain does not support specified action"。
//   仅当服务未加载（或 plist 内容变化）时才 bootstrap，并带退避重试。

import { execSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_SRC = dirname(fileURLToPath(import.meta.url)); // daemonctl.mjs 所在的 engine 目录
const DSH_HOME = process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh');
const BRIDGE_DIR = join(DSH_HOME, 'matrix-bridge');
const ENGINE_DST = join(BRIDGE_DIR, 'engine');
const LOG_DIR = join(BRIDGE_DIR, 'logs');
const CONFIG_PATH = join(BRIDGE_DIR, 'config.json');
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', 'ai.bigbear.dsh-matrix-bridge.plist');
const LABEL = 'ai.bigbear.dsh-matrix-bridge';
const DEFAULT_PORT = 47616;
const UID = typeof process.getuid === 'function' ? process.getuid() : 0;

function sh(cmd, { allowFail = false } = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return '';
    throw new Error(`命令失败: ${cmd}\n${error.stderr || error.message}`);
  }
}

// 主线程同步等待（Node 允许 Atomics.wait）
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function consolePort() {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const port = Number(config.console_port);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) return port;
  } catch {
    // 首次安装时还没有配置文件。
  }
  return DEFAULT_PORT;
}

function isLoaded() {
  return sh(`launchctl print gui/${UID}/${LABEL} 2>/dev/null`, { allowFail: true }) !== '';
}

function ensureEngineCopied() {
  if (!existsSync(join(ENGINE_SRC, 'main.mjs'))) {
    throw new Error(`引擎源文件缺失: ${join(ENGINE_SRC, 'main.mjs')}`);
  }
  const src = resolve(ENGINE_SRC);
  const dst = resolve(ENGINE_DST);
  mkdirSync(BRIDGE_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  if (src === dst) return; // 已在稳定目录直接运行
  if (dst.startsWith(src + sep)) throw new Error(`引擎目标目录不能位于源目录内: ${dst}`);
  // cpSync 会把 src 内容并入已存在的 dst，旧版本残留文件不参与新的入口加载。
  cpSync(src, dst, { recursive: true });
}

function buildPlistContent() {
  const nodeBin = process.execPath; // 用当前运行 daemonctl 的 node 启动引擎
  const userPath = ['.local/bin', 'bin', '.cargo/bin']
    .map((part) => join(homedir(), part))
    .concat(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])
    .join(':');
  const dshHomeEnv = process.env.DSH_HOME
    ? `\t\t<key>DSH_HOME</key>\n\t\t<string>${process.env.DSH_HOME}</string>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${nodeBin}</string>
		<string>${join(ENGINE_DST, 'main.mjs')}</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>HOME</key>
		<string>${homedir()}</string>
		<key>PATH</key>
		<string>${userPath}</string>
		<key>LANG</key>
		<string>en_US.UTF-8</string>
${dshHomeEnv}	</dict>
	<key>WorkingDirectory</key>
	<string>${BRIDGE_DIR}</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${join(LOG_DIR, 'daemon.out.log')}</string>
	<key>StandardErrorPath</key>
	<string>${join(LOG_DIR, 'daemon.err.log')}</string>
</dict>
</plist>
`;
}

// 带退避重试的加载：SSH/沙箱上下文或域卸载残留会偶发 125，多等几次
function loadAgent() {
  const delays = [0, 800, 2000, 4000];
  let lastError = null;
  for (const delay of delays) {
    if (delay > 0) sleep(delay);
    try {
      sh(`launchctl bootstrap gui/${UID} ${PLIST_PATH}`);
      return;
    } catch (error) {
      lastError = error;
      if (isLoaded()) return; // 已被其他途径加载
    }
  }
  // 终极兜底：传统 load API 在 SSH 会话下往往仍可用
  try {
    sh(`launchctl load -w ${PLIST_PATH}`);
    if (isLoaded()) {
      console.log('ℹ️ 已通过传统 launchctl load 完成加载');
      return;
    }
  } catch (error) {
    lastError = error;
  }
  throw new Error(`launchctl 加载多次失败（SSH 会话对 gui 域可能受限，建议在本机终端重试 install）:\n${lastError?.message || lastError}`);
}

// 完整卸载（等待异步卸载真正完成，供 plist 变更与 uninstall 使用）
function unloadAgent() {
  if (!isLoaded()) return;
  sh(`launchctl bootout gui/${UID}/${LABEL} 2>/dev/null || true`);
  for (let attempt = 0; attempt < 20 && isLoaded(); attempt += 1) {
    sleep(500); // 最长等 10 秒
  }
}

function install() {
  ensureEngineCopied();

  const previous = existsSync(PLIST_PATH) ? readFileSync(PLIST_PATH, 'utf-8') : '';
  const next = buildPlistContent();
  const plistChanged = previous !== next;
  if (plistChanged || !existsSync(PLIST_PATH)) {
    mkdirSync(dirname(PLIST_PATH), { recursive: true });
    writeFileSync(PLIST_PATH, next, 'utf-8');
  }

  if (isLoaded()) {
    if (plistChanged) {
      unloadAgent();
      loadAgent();
      console.log(`✅ 已更新 plist 并重新加载守护进程 (${LABEL})`);
    } else {
      sh(`launchctl kickstart -k gui/${UID}/${LABEL}`);
      console.log(`✅ 已同步引擎并原地重启守护进程 (${LABEL})`);
    }
  } else {
    loadAgent();
    console.log(`✅ 已安装并启动守护进程 (${LABEL})`);
  }
  console.log(`   引擎稳定目录: ${ENGINE_DST}`);
  console.log(`   配置文件:    ${CONFIG_PATH}`);
  console.log(`   管理控制台:  http://127.0.0.1:${consolePort()}/`);
}

function start() {
  if (!existsSync(PLIST_PATH)) {
    install();
    return;
  }
  if (isLoaded()) {
    sh(`launchctl kickstart gui/${UID}/${LABEL}`); // 未在跑则拉起，在跑则保持
    console.log(`✅ 已唤醒守护进程 (${LABEL})`);
  } else {
    loadAgent();
    console.log(`✅ 已启动守护进程 (${LABEL})`);
  }
}

function stop() {
  if (isLoaded()) {
    sh(`launchctl bootout gui/${UID}/${LABEL}`);
    console.log(`⏹️ 已停止守护进程 (${LABEL})`);
  } else {
    console.log(`守护进程未在运行 (${LABEL})`);
  }
}

function restart() {
  if (!existsSync(PLIST_PATH)) {
    install();
    return;
  }
  if (isLoaded()) {
    sh(`launchctl kickstart -k gui/${UID}/${LABEL}`);
    console.log(`🔄 已重启守护进程 (${LABEL})`);
  } else {
    loadAgent();
    console.log(`✅ 已启动守护进程 (${LABEL})`);
  }
}

async function status() {
  if (!existsSync(PLIST_PATH)) {
    console.log('状态: 未安装 (plist 不存在)。执行 install 安装。');
    return;
  }
  if (!isLoaded()) {
    console.log(`状态: 已注册但未运行 (${LABEL})。执行 start 启动。`);
    return;
  }
  const info = sh(`launchctl print gui/${UID}/${LABEL}`);
  const pid = info.match(/pid = (\d+)/);
  const state = info.match(/state = ([^\n]+)/);
  console.log(`状态: 运行中 (${LABEL})`);
  if (pid) console.log(`PID:  ${pid[1]}`);
  if (state) console.log(`细节: ${state[1].trim()}`);
  const port = consolePort();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    const rooms = data.room_count ?? data.rooms?.length ?? '?';
    console.log(`Bot:  ${data.sync_state || '?'}${data.user_id ? ' · ' + data.user_id : ''} · 房间 ${rooms}`);
  } catch {
    console.log('Bot:  控制台端口暂未就绪');
  }
}

function uninstall() {
  stop();
  if (existsSync(PLIST_PATH)) {
    rmSync(PLIST_PATH);
    console.log('🗑️ 已移除 LaunchAgent plist');
  }
  if (existsSync(ENGINE_DST)) {
    rmSync(ENGINE_DST, { recursive: true, force: true });
    console.log(`🗑️ 已移除引擎副本 (${ENGINE_DST})；config/state/logs 已保留`);
  }
}

async function main() {
  const action = process.argv[2];
  if (action && process.platform !== 'darwin') {
    console.error('daemonctl 仅支持 macOS LaunchAgent；其他系统请直接运行 node engine/main.mjs。');
    process.exit(1);
  }
  switch (action) {
    case 'install': install(); break;
    case 'start': start(); break;
    case 'stop': stop(); break;
    case 'restart': restart(); break;
    case 'status': await status(); break;
    case 'uninstall': uninstall(); break;
    default:
      console.error('用法: node daemonctl.mjs <install|start|stop|restart|status|uninstall>');
      process.exit(1);
  }
}

await main();
