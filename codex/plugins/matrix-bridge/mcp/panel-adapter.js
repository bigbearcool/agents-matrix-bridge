/* ==========================================================================
   Matrix Bridge Console — 双模适配层 (panel-adapter.js)
   --------------------------------------------------------------------------
   在页面最开始执行，自动识别运行环境并统一网络出口：

   1. MCP App 容器（Codex / ZCode 等）：
      检测 window.app?.callServerTool 或 window.__mcpApp / window.__mcpAppReady，
      （等价写法：window.app && typeof window.app.callServerTool === 'function'），
      把 /api/* 请求转换为对应的 MCP Tool 调用。
   2. 普通浏览器 / Antigravity Sidecar / 本地服务：
      使用标准 fetch(API_BASE + path, options)；
      若页面 URL 带有 ?token=... 则自动附带 X-Sidecar-Token 请求头。

   对全局导出：
     window.bridgeAPI = { request, ... }   // 标准入口
     window.api        = request           // 兼容旧调用
   ========================================================================== */
(function initMatrixBridgePanel(globalObject) {
  'use strict';

  const win = globalObject || (typeof window !== 'undefined' ? window : globalThis);
  const doc = win.document || null;
  const MCP_WAIT_MS = 3000;

  const AGENTS = {
    antigravity: {
      id: 'antigravity',
      name: 'Antigravity',
      port: 7890,
      color: '#818cf8'
    },
    codex: {
      id: 'codex',
      name: 'Codex',
      port: 47614,
      color: '#10b981'
    },
    zcode: {
      id: 'zcode',
      name: 'ZCode',
      port: 47613,
      color: '#f59e0b'
    },
    generic: {
      id: 'generic',
      name: '通用浏览器',
      port: 47614,
      color: '#9ca3af'
    }
  };

  // ------------------------------------------------------------------
  // 环境探测
  // ------------------------------------------------------------------
  function readQuery(name) {
    try {
      return new URLSearchParams(win.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function normalizeAgentId(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return '';
    if (value === 'agy' || value.includes('antigravity')) return 'antigravity';
    if (value === 'z-code' || value.includes('zcode')) return 'zcode';
    if (value.includes('codex')) return 'codex';
    if (value === 'generic' || value === 'browser' || value === 'web') return 'generic';
    return '';
  }

  function agentFromMcpApp(app) {
    if (!app) return null;
    let raw = '';
    try {
      if (typeof app.getHostVersion === 'function') raw += JSON.stringify(app.getHostVersion() || {});
    } catch (_) {}
    try {
      if (typeof app.getHostContext === 'function') {
        const context = app.getHostContext() || {};
        raw += JSON.stringify(context.hostInfo || context.userAgent || context || {});
      }
    } catch (_) {}
    const id = normalizeAgentId(raw);
    return id ? AGENTS[id] : null;
  }

  function detectAgent() {
    const explicitRaw =
      readQuery('agent') ||
      readQuery('host') ||
      readQuery('host_agent') ||
      win.MATRIX_BRIDGE_AGENT ||
      win.__MATRIX_BRIDGE_AGENT__ ||
      (win.bridgeAgent && win.bridgeAgent.id);
    const explicit = (explicitRaw && typeof explicitRaw === 'object')
      ? (explicitRaw.id || explicitRaw.name)
      : explicitRaw;

    const explicitId = normalizeAgentId(explicit);
    if (explicitId) return AGENTS[explicitId];

    // MCP App 容器：Codex / ZCode 面板都会注入连接器
    if (
      (win.app && typeof win.app.callServerTool === 'function') ||
      (win.__mcpApp && typeof win.__mcpApp.callServerTool === 'function') ||
      win.__mcpAppReady
    ) {
      // 若连接器已暴露 hostInfo / userAgent，优先按其识别宿主，否则按 Codex 面板处理
      const mcpAgent = agentFromMcpApp(win.app || win.__mcpApp);
      return mcpAgent || AGENTS.codex;
    }

    // Antigravity Sidecar 会注入 window.sidecar 与 onWorkspaceChange
    if (win.sidecar || win.antigravity || win.acquireVsCodeApi) {
      return AGENTS.antigravity;
    }

    if (win.zcode || win.__zcode || win.ZCode) {
      return AGENTS.zcode;
    }

    const ua = String(win.navigator && win.navigator.userAgent ? win.navigator.userAgent : '');
    if (/antigravity|\bagy\b/i.test(ua)) return AGENTS.antigravity;
    if (/zcode/i.test(ua)) return AGENTS.zcode;
    if (/codex/i.test(ua)) return AGENTS.codex;

    // 按本地控制台端口兜底识别
    try {
      const port = String(win.location.port || '');
      if (port === '7890') return AGENTS.antigravity;
      if (port === '47613') return AGENTS.zcode;
      if (port === '47614') return AGENTS.codex;
    } catch (_) {}

    return AGENTS.generic;
  }

  let agent = detectAgent();

  function isHttpOrigin() {
    try {
      return win.location.protocol === 'http:' || win.location.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function isLoopbackHost() {
    try {
      return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(win.location.hostname);
    } catch (_) {
      return false;
    }
  }

  function resolveApiBase() {
    const explicit =
      readQuery('api_base') ||
      readQuery('apiBase') ||
      win.MATRIX_BRIDGE_API_BASE ||
      win.__MATRIX_BRIDGE_API_BASE__;
    if (explicit) return String(explicit).replace(/\/+$/, '');

    // 由守护进程自身托管的页面（同源）直接使用相对路径
    if (isHttpOrigin()) {
      if (isLoopbackHost()) return '';
      try {
        if (String(win.location.port || '') === String(agent.port)) return '';
      } catch (_) {}
    }

    // 在 file://、MCP 沙箱或异源页面中回落到当前 Agent 的本地端口
    return 'http://127.0.0.1:' + agent.port;
  }

  const API_BASE = resolveApiBase();

  // ------------------------------------------------------------------
  // 请求参数归一化
  // ------------------------------------------------------------------
  function isSerializableBody(body) {
    if (body === null || body === undefined) return false;
    if (typeof body === 'string') return false;
    if (typeof win.FormData !== 'undefined' && body instanceof win.FormData) return false;
    if (typeof win.Blob !== 'undefined' && body instanceof win.Blob) return false;
    if (typeof win.URLSearchParams !== 'undefined' && body instanceof win.URLSearchParams) return false;
    if (typeof win.ArrayBuffer !== 'undefined' && body instanceof win.ArrayBuffer) return false;
    if (typeof win.ReadableStream !== 'undefined' && body instanceof win.ReadableStream) return false;
    return true;
  }

  function normalizeRequestOptions(methodOrOptions, legacyBody) {
    const options = {
      method: 'GET',
      headers: {},
      body: undefined,
      credentials: 'same-origin',
      signal: undefined
    };

    if (typeof methodOrOptions === 'string') {
      options.method = methodOrOptions.toUpperCase();
      options.body = legacyBody;
    } else if (methodOrOptions && typeof methodOrOptions === 'object') {
      options.method = String(methodOrOptions.method || 'GET').toUpperCase();
      options.body = methodOrOptions.body;
      if (methodOrOptions.headers && typeof methodOrOptions.headers === 'object') {
        options.headers = Object.assign({}, methodOrOptions.headers);
      }
      if (methodOrOptions.credentials) options.credentials = methodOrOptions.credentials;
      if (methodOrOptions.signal) options.signal = methodOrOptions.signal;
      if (methodOrOptions.mode) options.mode = methodOrOptions.mode;
      if (methodOrOptions.cache) options.cache = methodOrOptions.cache;
    }

    return options;
  }

  function serializeBody(options) {
    const body = options.body;
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') {
      const hasContentType = Object.keys(options.headers).some(
        key => key.toLowerCase() === 'content-type'
      );
      if (!hasContentType) options.headers['Content-Type'] = 'application/json';
      return body;
    }
    if (typeof win.FormData !== 'undefined' && body instanceof win.FormData) return body;
    if (typeof win.Blob !== 'undefined' && body instanceof win.Blob) return body;
    if (typeof win.URLSearchParams !== 'undefined' && body instanceof win.URLSearchParams) {
      return body;
    }
    if (isSerializableBody(body)) {
      const hasContentType = Object.keys(options.headers).some(
        key => key.toLowerCase() === 'content-type'
      );
      if (!hasContentType) options.headers['Content-Type'] = 'application/json';
      return JSON.stringify(body);
    }
    return body;
  }

  function getSidecarToken() {
    return (
      readQuery('token') ||
      win.MATRIX_BRIDGE_TOKEN ||
      win.__SIDECAR_TOKEN__ ||
      ''
    );
  }

  // ------------------------------------------------------------------
  // 模式一：标准 fetch（浏览器 / Sidecar / 本地服务）
  // ------------------------------------------------------------------
  async function fetchRequest(path, options) {
    const token = getSidecarToken();
    if (token && !Object.keys(options.headers).some(key => key.toLowerCase() === 'x-sidecar-token')) {
      options.headers['X-Sidecar-Token'] = token;
    }

    const url = /^https?:\/\//i.test(path) ? path : API_BASE + path;
    const requestOptions = {
      method: options.method,
      headers: options.headers,
      credentials: options.credentials
    };
    if (options.signal) requestOptions.signal = options.signal;
    if (options.mode) requestOptions.mode = options.mode;
    if (options.cache) requestOptions.cache = options.cache;

    const body = serializeBody(options);
    if (body !== undefined) requestOptions.body = body;

    const fetcher =
      win.sidecar && typeof win.sidecar.fetch === 'function'
        ? win.sidecar.fetch.bind(win.sidecar)
        : (typeof win.fetch === 'function' ? win.fetch.bind(win) : null);
    if (!fetcher) {
      throw new Error('当前环境不支持 fetch，请通过 MCP 面板或本地服务访问');
    }

    const response = await fetcher(url, requestOptions);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        (data && data.error) || `请求失败 (HTTP ${response.status})`
      );
    }
    return data;
  }

  // ------------------------------------------------------------------
  // 模式二：MCP App Tool 调用
  // ------------------------------------------------------------------
  const GET_PLANS = {
    '/api/status': [{ name: 'matrix_bridge_status' }],
    '/api/config': [{ name: 'matrix_bridge_config' }],
    '/api/rooms': [{ name: 'matrix_bridge_rooms' }],
    '/api/models': [{ name: 'matrix_bridge_models' }],
    '/api/logs': [{ name: 'matrix_bridge_logs' }],
    '/api/projects': [{ name: 'matrix_bridge_projects' }],
    '/api/browse': [
      { name: 'matrix_bridge_browse' },
      { name: 'matrix_bridge_fs_browse' }
    ],
    '/api/fs/browse': [
      { name: 'matrix_bridge_browse' },
      { name: 'matrix_bridge_fs_browse' }
    ],
    '/api/search': [
      { name: 'matrix_bridge_search' },
      { name: 'matrix_bridge_fs_search' }
    ],
    '/api/fs/search': [
      { name: 'matrix_bridge_search' },
      { name: 'matrix_bridge_fs_search' }
    ]
  };

  const POST_PLANS = {
    '/api/config': [
      { name: 'matrix_bridge_update_config' },
      {
        name: 'matrix_bridge_config',
        transform: args => ({ action: 'set', patch: args })
      }
    ],
    '/api/room': [
      { name: 'matrix_bridge_update_room' },
      {
        name: 'matrix_bridge_room_update',
        transform: args => {
          const next = Object.assign({}, args, { room_id: args.room_id || args.id });
          delete next.id;
          return next;
        }
      }
    ],
    '/api/rooms/update': [
      { name: 'matrix_bridge_update_room' },
      {
        name: 'matrix_bridge_room_update',
        transform: args => {
          const next = Object.assign({}, args, { room_id: args.room_id || args.id });
          delete next.id;
          return next;
        }
      }
    ],
    '/api/connection': [
      { name: 'matrix_bridge_connection' },
      { name: 'matrix_bridge_connect', when: args => args.paused !== true, transform: () => ({}) },
      { name: 'matrix_bridge_disconnect', when: args => args.paused === true, transform: () => ({}) }
    ],
    '/api/connect': [
      { name: 'matrix_bridge_connection', transform: () => ({ paused: false }) },
      { name: 'matrix_bridge_connect', transform: () => ({}) }
    ],
    '/api/disconnect': [
      { name: 'matrix_bridge_connection', transform: () => ({ paused: true }) },
      { name: 'matrix_bridge_disconnect', transform: () => ({}) }
    ],
    '/api/logout': [{ name: 'matrix_bridge_logout' }],
    '/api/auth': [
      {
        name: 'matrix_bridge_auth',
        when: args => args.access_token || args.username || args.password
      },
      {
        name: 'matrix_bridge_token',
        when: args => Boolean(args.access_token),
        transform: args => ({
          homeserver: args.homeserver,
          access_token: args.access_token
        })
      },
      {
        name: 'matrix_bridge_login',
        when: args => Boolean(args.username),
        transform: args => ({
          homeserver: args.homeserver,
          username: args.username,
          password: args.password
        })
      }
    ],
    '/api/login': [
      { name: 'matrix_bridge_auth' },
      {
        name: 'matrix_bridge_login',
        transform: args => ({
          homeserver: args.homeserver,
          username: args.username,
          password: args.password
        })
      }
    ],
    '/api/verify-token': [
      { name: 'matrix_bridge_auth' },
      {
        name: 'matrix_bridge_token',
        transform: args => ({
          homeserver: args.homeserver,
          access_token: args.access_token
        })
      }
    ],
    '/api/defaults': [
      { name: 'matrix_bridge_defaults' },
      {
        name: 'matrix_bridge_config',
        transform: args => ({
          action: 'set',
          patch: {
            default_model: args.model,
            default_effort: args.effort
          }
        })
      }
    ],
    '/api/migration': [{ name: 'matrix_bridge_migration' }],
    '/api/reconcile': [{ name: 'matrix_bridge_reconcile' }],
    '/api/logs/clear': [{ name: 'matrix_bridge_clear_logs' }]
  };

  function getDirectMcpApp() {
    if (win.app && typeof win.app.callServerTool === 'function') return win.app;
    if (win.__mcpApp && typeof win.__mcpApp.callServerTool === 'function') {
      return win.__mcpApp;
    }
    return null;
  }

  let mcpReadyPromise = null;
  let mcpUnavailable = false;

  async function waitForMcpApp() {
    const direct = getDirectMcpApp();
    if (direct) return direct;
    if (mcpUnavailable) return null;

    const ready = win.__mcpAppReady;
    if (!ready || typeof ready.then !== 'function') return null;

    if (!mcpReadyPromise) {
      mcpReadyPromise = Promise.race([
        Promise.resolve(ready).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), MCP_WAIT_MS))
      ]).then(app => {
        const resolved = (app && typeof app.callServerTool === 'function')
          ? app
          : getDirectMcpApp();
        if (!resolved) {
          mcpUnavailable = true;
        } else {
          const mcpAgent = agentFromMcpApp(resolved);
          if (mcpAgent) setAgent(mcpAgent);
          if (win.bridgeAPI) win.bridgeAPI.mode = getTransportMode();
        }
        return resolved;
      });
    }
    return mcpReadyPromise;
  }

  function mcpResponseText(response) {
    const blocks = (response && response.content) || [];
    const block = blocks.find(item => item && item.type === 'text');
    return block ? String(block.text || '') : '';
  }

  function parseMcpResponse(response) {
    if (response && response.structuredContent !== undefined && response.structuredContent !== null) {
      return response.structuredContent;
    }
    const text = mcpResponseText(response);
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return { text };
    }
  }

  function isUnknownToolError(message) {
    return /unknown\s+tool|tool\s+(?:not\s+found|does\s+not\s+exist)|未知工具|工具不存在/i.test(
      String(message || '')
    );
  }

  function getMcpArgs(options, url) {
    let args = {};
    const isFormData = typeof win.FormData === 'function' && options.body instanceof win.FormData;
    if (options.body && typeof options.body === 'object' && !isFormData) {
      args = Object.assign({}, options.body);
    } else if (typeof options.body === 'string') {
      try {
        const parsed = JSON.parse(options.body);
        if (parsed && typeof parsed === 'object') args = parsed;
      } catch (_) {
        args = {};
      }
    }

    if (url.pathname === '/api/browse' || url.pathname === '/api/fs/browse') {
      args = { path: url.searchParams.get('path') || args.path || '' };
    }
    if (url.pathname === '/api/search' || url.pathname === '/api/fs/search') {
      args = { query: url.searchParams.get('q') || url.searchParams.get('query') || args.query || '' };
    }
    if (url.pathname === '/api/connect') args = { paused: false };
    if (url.pathname === '/api/disconnect') args = { paused: true };
    return args;
  }

  async function callMcp(app, path, options) {
    let url;
    try {
      url = new URL(path, 'http://localhost');
    } catch (_) {
      throw new Error('无效的 API 路径: ' + path);
    }

    const plans = (options.method === 'POST' ? POST_PLANS : GET_PLANS)[url.pathname];
    if (!plans || plans.length === 0) {
      throw new Error('此操作不支持在嵌入面板中执行: ' + url.pathname);
    }

    const args = getMcpArgs(options, url);
    let lastError = null;

    for (const plan of plans) {
      if (plan.when && !plan.when(args)) continue;
      const toolArgs = plan.transform ? plan.transform(args) : args;
      try {
        const response = await app.callServerTool({ name: plan.name, arguments: toolArgs });
        if (response && response.isError) {
          const text = mcpResponseText(response);
          if (plans.length > 1 && isUnknownToolError(text)) {
            lastError = new Error(text);
            continue;
          }
          throw new Error(text || '操作失败');
        }
        return parseMcpResponse(response);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (plans.length > 1 && isUnknownToolError(message)) {
          lastError = new Error(message);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('此操作不支持在嵌入面板中执行: ' + url.pathname);
  }

  // ------------------------------------------------------------------
  // 统一入口
  // ------------------------------------------------------------------
  function getTransportMode() {
    if (getDirectMcpApp()) return 'mcp';
    if (win.__mcpAppReady && !mcpUnavailable) return 'mcp-pending';
    return 'fetch';
  }

  async function request(path, methodOrOptions, legacyBody) {
    if (typeof path !== 'string' || !path) {
      throw new Error('无效的 API 路径');
    }
    const options = normalizeRequestOptions(methodOrOptions, legacyBody);

    const app = await waitForMcpApp();
    if (app) return callMcp(app, path, options);
    return fetchRequest(path, options);
  }

  // ------------------------------------------------------------------
  // 全局确认对话框（兼容 MCP 面板与浏览器）
  // ------------------------------------------------------------------
  function confirmAction(message) {
    if (!doc || !doc.body) {
      return Promise.resolve(win.confirm ? win.confirm(message) : false);
    }

    return new Promise(resolve => {
      const overlay = doc.createElement('div');
      overlay.className = 'confirm-overlay';

      const dialog = doc.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      const text = doc.createElement('p');
      text.textContent = message;

      const cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '取消';

      const accept = doc.createElement('button');
      accept.type = 'button';
      accept.textContent = '确认';

      const close = result => {
        doc.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(result);
      };
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        }
      };

      cancel.onclick = () => close(false);
      accept.onclick = () => close(true);
      overlay.onclick = event => {
        if (event.target === overlay) close(false);
      };

      dialog.append(text, cancel, accept);
      overlay.append(dialog);
      doc.body.append(overlay);
      doc.addEventListener('keydown', onKeyDown);
      cancel.focus();
    });
  }

  // ------------------------------------------------------------------
  // Agent 徽标 / 主题等页面增强
  // ------------------------------------------------------------------
  function setTheme(theme) {
    if (!doc) return false;
    if (theme !== 'dark' && theme !== 'light') return false;
    doc.documentElement.dataset.theme = theme;
    try {
      doc.documentElement.style.colorScheme = theme;
    } catch (_) {}
    return true;
  }

  function setAgent(nextAgent) {
    if (!nextAgent || nextAgent.id === agent.id) return false;
    agent = nextAgent;
    if (win.bridgeAPI) {
      win.bridgeAPI.agent = Object.assign({}, agent);
      win.bridgeAPI.agentId = agent.id;
    }
    win.MATRIX_BRIDGE_AGENT = Object.assign({}, agent);
    win.bridgeAgent = Object.assign({}, agent);
    applyAgentChrome();
    return true;
  }

  function applyAgentChrome() {
    if (!doc || typeof doc.getElementById !== 'function') return;
    const root = doc.documentElement;
    const body = doc.body;
    if (root && root.dataset) root.dataset.agent = agent.id;
    if (body && body.dataset) body.dataset.agent = agent.id;

    const label = doc.getElementById('agentBadgeLabel');
    if (label) label.textContent = agent.name;

    const badge = doc.getElementById('agentBadge');
    if (badge) {
      badge.title = `当前 Agent: ${agent.name} · 通信模式: ${getTransportMode() === 'fetch' ? 'HTTP fetch' : 'MCP Tool'}`;
      badge.style.setProperty('--agent-color', agent.color);
    }

    const dot = doc.getElementById('agentBadgeDot');
    if (dot) dot.style.background = agent.color;

    // 兼容旧版静态标题：仅追加当前 Agent 徽标，不改变文档标题语义
    const brand = doc.getElementById('brandName');
    if (brand && !brand.dataset.unifiedTitle) {
      brand.dataset.unifiedTitle = 'true';
    }

    if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent('matrix-bridge:agent-ready', {
        detail: { agent: Object.assign({}, agent), mode: getTransportMode() }
      }));
    }
  }

  if (doc) {
    if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
      doc.addEventListener('DOMContentLoaded', applyAgentChrome, { once: true });
    } else if (doc.readyState !== 'loading') {
      applyAgentChrome();
    }
  }

  // 宿主主题变化（部分宿主通过 postMessage 下发）
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('message', event => {
      if (event && event.data && event.data.type === 'theme-change') {
        const payload = event.data.payload || {};
        const vars = payload.cssVariables || {};
        const bg = vars['--background'] || vars['--vscode-sideBar-background'];
        if (typeof bg === 'string' && /^#|^rgb/i.test(bg)) {
          let rgb = bg;
          if (/^#/.test(bg)) {
            let hex = bg.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length >= 6) {
              rgb = `rgb(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)})`;
            }
          }
          const match = String(rgb).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
          if (match) {
            const lum =
              (0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])) / 255;
            setTheme(lum > 0.58 ? 'light' : 'dark');
          }
        }
      }
    });
  }

  const bridgeAPI = {
    request,
    agent: Object.assign({}, agent),
    agentId: agent.id,
    apiBase: API_BASE,
    mode: getTransportMode(),
    detectAgent,
    getTransportMode,
    setTheme,
    confirmAction
  };

  win.bridgeAPI = bridgeAPI;
  win.api = request;
  win.confirmAction = confirmAction;
  win.MATRIX_BRIDGE_AGENT = Object.assign({}, agent);
  win.bridgeAgent = Object.assign({}, agent);

  // 浏览器环境显式挂载到 window，便于宿主与旧脚本按标准名称读取
  if (typeof window !== 'undefined') {
    window.bridgeAPI = bridgeAPI;
    window.api = request;
    window.confirmAction = confirmAction;
    window.MATRIX_BRIDGE_AGENT = Object.assign({}, agent);
    window.bridgeAgent = Object.assign({}, agent);
  }
})(typeof window !== 'undefined' ? window : globalThis);
