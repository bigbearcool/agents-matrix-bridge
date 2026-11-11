#!/usr/bin/env node
/**
 * Standalone engine entry for dsh-matrix-bridge.
 *
 * The desktop plugin (engine/index.mjs) runs inside Cordis; this entry runs the
 * same engine outside the desktop app. daemonctl.mjs starts exactly this file
 * through the ai.bigbear.dsh-matrix-bridge LaunchAgent:
 *
 *   node engine/main.mjs [--config ~/.dsh/matrix-bridge/config.json]
 *
 * It holds the single-instance lock next to the bridge state, waits for the
 * console listener to bind, then lets Bridge sync Matrix. SIGTERM/SIGINT stop
 * Matrix sync and release the lock; launchd's KeepAlive restarts on demand.
 */

import { acquireLock } from './core/index.mjs';
import { defaultConfigPath, startBridge } from './index.mjs';

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const configPath = argumentValue('--config') || process.env.DSH_MATRIX_CONFIG || defaultConfigPath();

let handle;
try {
  handle = startBridge({ get: () => undefined }, {}, {
    configPath,
    logger: console,
    autoConnect: false
  });
} catch (error) {
  console.error(`[DSH Matrix Bridge] 启动失败: ${error.message}`);
  process.exit(1);
}

let releaseLock;
try {
  releaseLock = await acquireLock(handle.bridge.statePath);
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error('[DSH Matrix Bridge] 已有实例持有单实例锁，本次启动退出。');
    handle.stop();
    process.exit(0);
  }
  console.error(`[DSH Matrix Bridge] 获取单实例锁失败: ${error.message}`);
  handle.stop();
  process.exit(1);
}

try {
  await handle.ready;
} catch (error) {
  console.error(`[DSH Matrix Bridge] 控制台端口 ${handle.port} 不可用: ${error.message}`);
  handle.stop();
  await releaseLock().catch(() => {});
  process.exit(1);
}

console.log(`[DSH Matrix Bridge] 控制台: http://127.0.0.1:${handle.port}/`);
console.log(`[DSH Matrix Bridge] 配置文件: ${handle.configPath}`);
console.log(`[DSH Matrix Bridge] 工作目录: ${handle.config.cwd}`);
console.log(`[DSH Matrix Bridge] 适配器 CLI: ${handle.adapter.defaultCliPath}`);

if (!handle.bridge.token) {
  console.log('[DSH Matrix Bridge] 尚未配置 Matrix 访问令牌，请在控制台完成登录。');
} else if (handle.config.auto_connect !== false) {
  handle.bridge.run().catch((error) => {
    console.warn(`[DSH Matrix Bridge] Matrix 连接异常: ${error.message}`);
  });
  console.log('[DSH Matrix Bridge] Matrix 自动连接已启动。');
}

let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[DSH Matrix Bridge] 正在停止 (${reason})...`);
  handle.stop();
  await releaseLock().catch((error) => {
    console.warn(`[DSH Matrix Bridge] 释放单实例锁失败: ${error.message}`);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    shutdown(signal).finally(() => process.exit(0));
  });
}
process.on('uncaughtException', (error) => {
  console.error(`[DSH Matrix Bridge] 未捕获异常: ${error?.stack || error}`);
  shutdown('uncaughtException').finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  console.error(`[DSH Matrix Bridge] 未处理的 Promise 拒绝: ${reason?.stack || reason}`);
});
