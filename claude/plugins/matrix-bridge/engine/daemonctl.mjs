#!/usr/bin/env node
// Claude Matrix Bridge — 守护进程管理器（LaunchAgent）
// 用法: node daemonctl.mjs <install|start|stop|restart|status|uninstall>
//
// 设计要点：
// - Claude 插件缓存目录带版本号（更新后路径变化），LaunchAgent 不能直接指向缓存；
//   install 会把引擎复制到稳定目录 ~/.claude/matrix-bridge/engine/ 再注册自启。
// - 插件升级后需重新执行 install 以同步引擎代码（config/rooms 数据不受影响）。
// - 重启策略：服务已加载时一律用 kickstart 原地重启（进程每次启动都现读引擎文件），
//   绝不走 bootout→bootstrap —— 域卸载是异步的，且 SSH/沙箱上下文对 gui 域操作受限，
//   极易触发 "Bootstrap failed: 125: Domain does not support specified action"。
//   仅当服务未加载（或 plist 内容变化）时才 bootstrap，并带退避重试。
import { execSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_SRC = dirname(fileURLToPath(import.meta.url)); // daemonctl.mjs 所在的 engine 目录
const STABLE_DIR = join(homedir(), '.claude', 'matrix-bridge');
const ENGINE_DST = join(STABLE_DIR, 'engine');
const LOG_DIR = join(STABLE_DIR, 'logs');
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', 'ai.bigbear.claude-matrix-bridge.plist');
const LABEL = 'ai.bigbear.claude-matrix-bridge';
const CONSOLE_PORT = 47615;
const UID = process.getuid();

function sh(cmd, { allowFail = false } = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return '';
    throw new Error(`命令失败: ${cmd}\n${err.stderr || err.message}`);
  }
}

// 主线程同步等待（Node 允许 Atomics.wait）
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
  mkdirSync(ENGINE_DST, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  if (src === dst) return;
  // 复制引擎主体与控制台资源
  cpSync(join(ENGINE_SRC, 'main.mjs'), join(ENGINE_DST, 'main.mjs'));
  if (existsSync(join(ENGINE_SRC, 'core'))) {
    cpSync(join(ENGINE_SRC, 'core'), join(ENGINE_DST, 'core'), { recursive: true });
  }
  if (existsSync(join(ENGINE_SRC, 'adapter.mjs'))) {
    cpSync(join(ENGINE_SRC, 'adapter.mjs'), join(ENGINE_DST, 'adapter.mjs'));
  }
  if (existsSync(join(ENGINE_SRC, 'console'))) {
    cpSync(join(ENGINE_SRC, 'console'), join(ENGINE_DST, 'console'), { recursive: true });
  }
  // 附带自身，便于运维直接在稳定目录执行
  cpSync(fileURLToPath(import.meta.url), join(ENGINE_DST, 'daemonctl.mjs'));
}

function buildPlistContent() {
  const nodeBin = process.execPath; // 用当前运行 daemonctl 的 node 启动引擎
  const userPath = ['.local/bin', 'bin', '.cargo/bin']
    .map(p => join(homedir(), p))
    .concat(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])
    .join(':');
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
	</dict>
	<key>WorkingDirectory</key>
	<string>${STABLE_DIR}</string>
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

// 带退避重试的加载：SSH/沙箱上下文或域卸载残留会偶发 125，多等多试几次
function loadAgent() {
  const delays = [0, 800, 2000, 4000];
  let lastErr = null;
  for (const d of delays) {
    if (d > 0) sleep(d);
    try {
      sh(`launchctl bootstrap gui/${UID} ${PLIST_PATH}`);
      return;
    } catch (err) {
      lastErr = err;
      // 已被其他途径加载则直接视为成功
      if (isLoaded()) return;
    }
  }
  // 终极兜底：传统 load API 在 SSH 会话下往往仍可用
  try {
    sh(`launchctl load -w ${PLIST_PATH}`);
    if (isLoaded()) {
      console.log('ℹ️ 已通过传统 launchctl load 完成加载');
      return;
    }
  } catch (err) {
    lastErr = err;
  }
  throw new Error(`launchctl 加载多次失败（SSH 会话对 gui 域可能受限，建议在本机终端或 Claude 会话中重试 install）:\n${lastErr?.message || lastErr}`);
}

// 完整卸载（等待异步卸载真正完成，供 plist 变更与 uninstall 使用）
function unloadAgent() {
  if (!isLoaded()) return;
  sh(`launchctl bootout gui/${UID}/${LABEL} 2>/dev/null || true`);
  for (let i = 0; i < 20 && isLoaded(); i++) {
    sleep(500); // 最长等 10 秒
  }
}

function install() {
  ensureEngineCopied();

  const prevPlist = existsSync(PLIST_PATH) ? readFileSync(PLIST_PATH, 'utf-8') : '';
  const nextPlist = buildPlistContent();
  const plistChanged = prevPlist !== nextPlist;
  if (plistChanged || !existsSync(PLIST_PATH)) {
    mkdirSync(dirname(PLIST_PATH), { recursive: true });
    writeFileSync(PLIST_PATH, nextPlist, 'utf-8');
  }

  if (isLoaded()) {
    if (plistChanged) {
      // plist 变化必须重新加载（kickstart 不会重读 plist）
      unloadAgent();
      loadAgent();
      console.log(`✅ 已更新 plist 并重新加载守护进程 (${LABEL})`);
    } else {
      // 引擎文件每次启动现读：原地重启进程即可，不触碰 launchd 域（规避 125）
      sh(`launchctl kickstart -k gui/${UID}/${LABEL}`);
      console.log(`✅ 已同步引擎并原地重启守护进程 (${LABEL})`);
    }
  } else {
    loadAgent();
    console.log(`✅ 已安装并启动守护进程 (${LABEL})`);
  }
  console.log(`   引擎稳定目录: ${ENGINE_DST}`);
  console.log(`   管理控制台:    http://127.0.0.1:${CONSOLE_PORT}/`);
}

function start() {
  if (!existsSync(PLIST_PATH)) {
    install();
    return;
  }
  if (isLoaded()) {
    sh(`launchctl kickstart gui/${UID}/${LABEL}`); // 不带 -k：未在跑则拉起，在跑则保持
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

function status() {
  if (!existsSync(PLIST_PATH)) {
    console.log(`状态: 未安装 (plist 不存在)。执行 install 安装。`);
    return;
  }
  if (!isLoaded()) {
    console.log(`状态: 已注册但未运行 (${LABEL})。执行 start 启动。`);
    return;
  }
  const info = sh(`launchctl print gui/${UID}/${LABEL}`);
  const pidMatch = info.match(/pid = (\d+)/);
  const stateMatch = info.match(/state = ([^\n]+)/);
  console.log(`状态: 运行中 (${LABEL})`);
  if (pidMatch) console.log(`PID:  ${pidMatch[1]}`);
  if (stateMatch) console.log(`细节: ${stateMatch[1].trim()}`);
  // 顺带探测管理控制台
  const probe = spawnSync(process.execPath, ['-e', `
    fetch('http://127.0.0.1:${CONSOLE_PORT}/api/status').then(r => r.json()).then(d => {
      console.log('Bot:  ' + (d.sync_state || '?') + (d.user_id ? ' · ' + d.user_id : '') + ' · 房间 ' + (d.room_count ?? '?'));
    }).catch(() => console.log('Bot:  控制台端口暂未就绪'));
  `], { encoding: 'utf-8', timeout: 15000 });
  if (probe.stdout) console.log(probe.stdout.trim());
}

function uninstall() {
  stop();
  if (existsSync(PLIST_PATH)) {
    rmSync(PLIST_PATH);
    console.log(`🗑️ 已移除 LaunchAgent plist`);
  }
  if (existsSync(ENGINE_DST)) {
    rmSync(ENGINE_DST, { recursive: true, force: true });
    console.log(`🗑️ 已移除引擎副本 (${ENGINE_DST})；config/rooms 数据已保留`);
  }
}

const action = process.argv[2];
switch (action) {
  case 'install': install(); break;
  case 'start': start(); break;
  case 'stop': stop(); break;
  case 'restart': restart(); break;
  case 'status': status(); break;
  case 'uninstall': uninstall(); break;
  default:
    console.error('用法: node daemonctl.mjs <install|start|stop|restart|status|uninstall>');
    process.exit(1);
}
