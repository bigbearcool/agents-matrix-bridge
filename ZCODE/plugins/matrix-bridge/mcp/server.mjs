#!/usr/bin/env node
// ZCode Matrix Bridge — MCP 管理服务器 (stdio)
// 职责：把管理操作转发给本机守护进程 HTTP API；守护进程生命周期由 daemonctl.mjs 管理。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const BRIDGE_URL = (process.env.MATRIX_BRIDGE_URL || 'http://127.0.0.1:47613').replace(/\/+$/, '');
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || '';
const DAEMONCTL = join(PLUGIN_ROOT, 'engine', 'daemonctl.mjs');

// ---------- 右侧面板资源（mcp-app） ----------
const PANEL_URI = 'ui://matrix-bridge/panel.html';
const PANEL_MIME = 'text/html;profile=mcp-app';
// 面板 webview 的 CSP 白名单：允许直连本机守护进程 API（引擎仅绑定 127.0.0.1）
const PANEL_META = {
  ui: {
    csp: {
      connectDomains: [BRIDGE_URL],
      frameDomains: [BRIDGE_URL]
    }
  }
};

function buildPanelHtml() {
  const consoleDir = join(PLUGIN_ROOT, 'engine', 'console');
  let html = readFileSync(join(consoleDir, 'index.html'), 'utf-8');
  const css = readFileSync(join(consoleDir, 'styles.css'), 'utf-8');
  // mcp-app 连接器：完成宿主 ui/initialize 握手并暴露 window.__mcpApp（由 tools/console-build 构建）
  const connector = readFileSync(join(consoleDir, 'vendor', 'mcp-app-connector.js'), 'utf-8');
  const js = readFileSync(join(consoleDir, 'app.js'), 'utf-8');
  html = html
    // 用替换函数而非替换串：内联代码含 $& / $' 等序列时，替换串会被展开损坏 bundle
    .replace('<link rel="stylesheet" href="/styles.css">', () => `<style>\n${css}\n</style>`)
    .replace('<script src="/preload.js"></script>', () => `<script>\n${connector}\n</script>`)
    .replace('<script src="/app.js"></script>', () => `<script>\n${js}\n</script>`);
  return html;
}

// ---------- 最小 JSON-RPC / MCP stdio 层 ----------
function writeMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function toolResult(text, isError = false) {
  return { content: [{ type: 'text', text: String(text) }], isError };
}

async function callBridge(path, method = 'GET', body = null) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (HTTP ${res.status})`);
  }
  return data;
}

function runDaemonctl(action) {
  if (!PLUGIN_ROOT) {
    throw new Error('未获取到插件根目录（CLAUDE_PLUGIN_ROOT），无法执行守护进程操作；请改用: node <插件目录>/engine/daemonctl.mjs ' + action);
  }
  const r = spawnSync(process.execPath, [DAEMONCTL, action], {
    encoding: 'utf-8',
    timeout: 60000
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) {
    throw new Error(out || `daemonctl ${action} 退出码 ${r.status}`);
  }
  return out || `daemonctl ${action} 完成`;
}

// ---------- 工具定义 ----------
const TOOLS = [
  {
    name: 'matrix_bridge_status',
    description: '查看 Matrix 机器人连接状态：是否在线、账号、Homeserver、房间数、默认策略与最近错误。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_config',
    description: '读取（action=get，默认）或修改（action=set）Matrix 机器人配置。可修改字段：homeserver、base_dir（默认项目根目录）、default_policy(mention|all|mute)、admins、invite_policy(all|local_server|allowlist|none)、invite_allowlist、message_policy(all|local_server|allowlist|blocklist|none)、message_allowlist、message_blocklist、federated_room_guard、isolate_unbound_rooms、admin_only_workspace、redact_sensitive、rate_limit_enabled、zcode_cmd、auto_connect。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        patch: {
          type: 'object',
          description: 'action=set 时要合并的配置字段（不会动密码与 Token）'
        }
      }
    }
  },
  {
    name: 'matrix_bridge_login',
    description: '用账号密码向 Homeserver 登录 Matrix 机器人并自动启动同步（密码仅用于换取设备 Token，不明文落盘）。',
    inputSchema: {
      type: 'object',
      required: ['homeserver', 'username', 'password'],
      properties: {
        homeserver: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' }
      }
    }
  },
  {
    name: 'matrix_bridge_token',
    description: '用现有 Access Token 直连 Matrix 并校验身份（/whoami），成功后自动启动同步。适合从旧桥（如 cc-connect）迁移复用令牌。',
    inputSchema: {
      type: 'object',
      required: ['homeserver', 'access_token'],
      properties: {
        homeserver: { type: 'string' },
        access_token: { type: 'string' }
      }
    }
  },
  {
    name: 'matrix_bridge_logout',
    description: '暂停同步并清除本地保存的 Matrix 凭证。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_rooms',
    description: '列出机器人已加入的 Matrix 房间：名称、私聊/群聊、成员数、绑定工作区、生效触发策略、是否含外服联邦成员、会话状态。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_room_update',
    description: '更新单个房间配置：绑定/解绑工作区（绝对路径或相对默认根目录；传空字符串解绑）、切换触发策略、重置会话上下文。切换目录会自动重置该房间会话。',
    inputSchema: {
      type: 'object',
      required: ['room_id'],
      properties: {
        room_id: { type: 'string', description: 'Matrix 房间 ID（!开头）' },
        policy: { type: 'string', enum: ['mention', 'all', 'mute', 'default'] },
        workspace: { type: 'string' },
        model: { type: 'string', description: '房间专属模型，传空字符串恢复跟随全局' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max', 'default', ''], description: '思考深度' },
        reset_session: { type: 'boolean' }
      }
    }
  },
  {
    name: 'matrix_bridge_models',
    description: '获取可用模型列表和思考深度可选档位。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'matrix_bridge_fs_browse',
    description: '浏览目录（默认从配置的项目根目录开始），返回子目录列表、Git 仓库标记与面包屑，用于挑选房间绑定目录。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '留空表示默认根目录；支持 ~ 与绝对/相对路径' } }
    }
  },
  {
    name: 'matrix_bridge_fs_search',
    description: '在默认项目根目录下递归搜索（最多 4 层）子目录，按名称或相对路径匹配。',
    inputSchema: {
      type: 'object',
      required: ['q'],
      properties: { q: { type: 'string' } }
    }
  },
  {
    name: 'matrix_bridge_projects',
    description: '列出本地默认项目根目录下的项目（面板「房间」页签绑定目录时浏览用）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_connect',
    description: '启动 Matrix 同步（恢复在线）。对应面板「暂停/恢复」按钮。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_disconnect',
    description: '暂停 Matrix 同步（保持凭证，仅停止收发）。对应面板「暂停/恢复」按钮。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_logs',
    description: '读取最近运行日志（含消息收发与安全拦截记录，环形缓冲 300 条）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_clear_logs',
    description: '清空运行日志环形缓冲。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'matrix_bridge_daemon',
    description: '管理 24/7 守护进程（LaunchAgent ai.bigbear.zcode-matrix-bridge）。install：把插件内引擎复制到稳定目录 ~/.zcode/matrix-bridge/engine 并注册开机自启（插件升级后需重跑以同步引擎）；start/stop/restart：启停；status：运行状态；uninstall：停止并移除自启（保留数据）。除 status 外动作会影响线上机器人。',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: { action: { type: 'string', enum: ['install', 'start', 'stop', 'restart', 'status', 'uninstall'] } }
    }
  }
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'matrix_bridge_status':
      return await callBridge('/api/status');
    case 'matrix_bridge_config':
      if ((args.action || 'get') === 'set') {
        return await callBridge('/api/config', 'POST', args.patch || {});
      }
      return await callBridge('/api/config');
    case 'matrix_bridge_login':
      return await callBridge('/api/login', 'POST', {
        homeserver: args.homeserver,
        username: args.username,
        password: args.password,
        auto_start: true
      });
    case 'matrix_bridge_token':
      return await callBridge('/api/verify-token', 'POST', {
        homeserver: args.homeserver,
        access_token: args.access_token,
        auto_start: true
      });
    case 'matrix_bridge_logout':
      return await callBridge('/api/logout', 'POST');
    case 'matrix_bridge_rooms':
      return await callBridge('/api/rooms');
    case 'matrix_bridge_models':
      return await callBridge('/api/models');
    case 'matrix_bridge_room_update': {
      const body = { id: args.room_id };
      if (args.policy !== undefined) body.policy = args.policy;
      if (args.workspace !== undefined) body.workspace = args.workspace;
      if (args.model !== undefined) body.model = args.model;
      if (args.effort !== undefined) body.effort = args.effort;
      if (args.reset_session !== undefined) body.reset_session = args.reset_session;
      return await callBridge('/api/rooms/update', 'POST', body);
    }
    case 'matrix_bridge_fs_browse':
      return await callBridge(`/api/fs/browse?path=${encodeURIComponent(args.path || '')}`);
    case 'matrix_bridge_fs_search':
      return await callBridge(`/api/fs/search?q=${encodeURIComponent(args.q || '')}`);
    case 'matrix_bridge_projects':
      return await callBridge('/api/projects');
    case 'matrix_bridge_connect':
      return await callBridge('/api/connect', 'POST');
    case 'matrix_bridge_disconnect':
      return await callBridge('/api/disconnect', 'POST');
    case 'matrix_bridge_logs':
      return await callBridge('/api/logs');
    case 'matrix_bridge_clear_logs':
      return await callBridge('/api/logs/clear', 'POST');
    case 'matrix_bridge_daemon':
      return { daemon_output: runDaemonctl(String(args.action || 'status')) };
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ---------- stdio 主循环 ----------
let inputBuf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  inputBuf += chunk;
  let idx;
  while ((idx = inputBuf.indexOf('\n')) >= 0) {
    const line = inputBuf.slice(0, idx).trim();
    inputBuf = inputBuf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      continue;
    }
    handleMessage(msg).catch((err) => {
      if (msg.id !== undefined) {
        writeMsg({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } });
      }
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    writeMsg({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'zcode-matrix-bridge', version: '0.1.0' }
      }
    });
    return;
  }
  if (msg.method === 'notifications/initialized' || msg.id === undefined) {
    return; // 通知类消息不回应
  }
  if (msg.method === 'tools/list') {
    writeMsg({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === 'resources/list') {
    writeMsg({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        resources: [
          {
            uri: PANEL_URI,
            name: 'Matrix Bot 控制台',
            description: 'Matrix 机器人可视化管理面板：房间、安全准入、账号与运行动态',
            mimeType: PANEL_MIME,
            _meta: PANEL_META
          }
        ]
      }
    });
    return;
  }
  if (msg.method === 'resources/read') {
    const uri = String(msg.params?.uri || '');
    if (uri !== PANEL_URI) {
      writeMsg({ jsonrpc: '2.0', id: msg.id, error: { code: -32002, message: `Unknown resource: ${uri}` } });
      return;
    }
    try {
      writeMsg({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          contents: [
            {
              uri: PANEL_URI,
              mimeType: PANEL_MIME,
              text: buildPanelHtml(),
              _meta: PANEL_META
            }
          ]
        }
      });
    } catch (err) {
      writeMsg({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `面板资源生成失败: ${err.message}` } });
    }
    return;
  }
  if (msg.method === 'tools/call') {
    const toolName = msg.params?.name;
    const args = msg.params?.arguments || {};
    try {
      const data = await handleToolCall(toolName, args);
      writeMsg({ jsonrpc: '2.0', id: msg.id, result: toolResult(JSON.stringify(data, null, 2)) });
    } catch (err) {
      const hint = /fetch failed|ECONNREFUSED|TimeoutError|aborted/i.test(err.message)
        ? `（守护进程可能未运行：${BRIDGE_URL} 不可达。可用 matrix_bridge_daemon 的 start/install 启动）`
        : '';
      writeMsg({
        jsonrpc: '2.0',
        id: msg.id,
        result: toolResult(`请求失败: ${err.message}${hint}`, true)
      });
    }
    return;
  }
  if (msg.method === 'ping') {
    writeMsg({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  writeMsg({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
}

process.stdin.on('end', () => process.exit(0));
