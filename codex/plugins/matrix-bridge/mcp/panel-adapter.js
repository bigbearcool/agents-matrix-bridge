// MCP App: UI requests go through the host and the local MCP server, never direct cross-origin HTTP.
async function api(path, options) {
  const app = await window.__mcpAppReady;
  if (!app) throw Error('Codex 面板连接失败，请重新打开管理台。');
  const url = new URL(path, 'http://localhost');
  const get = {
    '/api/status': 'matrix_bridge_status',
    '/api/config': 'matrix_bridge_config',
    '/api/rooms': 'matrix_bridge_rooms',
    '/api/models': 'matrix_bridge_models',
    '/api/logs': 'matrix_bridge_logs',
    '/api/browse': 'matrix_bridge_browse',
    '/api/fs/browse': 'matrix_bridge_browse',
    '/api/search': 'matrix_bridge_search',
    '/api/fs/search': 'matrix_bridge_search',
    '/api/projects': 'matrix_bridge_projects'
  };
  const post = {
    '/api/config': 'matrix_bridge_update_config',
    '/api/room': 'matrix_bridge_update_room',
    '/api/rooms/update': 'matrix_bridge_update_room',
    '/api/connection': 'matrix_bridge_connection',
    '/api/connect': 'matrix_bridge_connection',
    '/api/disconnect': 'matrix_bridge_connection',
    '/api/logout': 'matrix_bridge_logout',
    '/api/auth': 'matrix_bridge_auth',
    '/api/login': 'matrix_bridge_auth',
    '/api/verify-token': 'matrix_bridge_auth',
    '/api/defaults': 'matrix_bridge_defaults',
    '/api/migration': 'matrix_bridge_migration',
    '/api/reconcile': 'matrix_bridge_reconcile',
    '/api/logs/clear': 'matrix_bridge_clear_logs'
  };
  const isPost = typeof options === 'string' ? options === 'POST' : options?.method === 'POST';
  const name = isPost ? post[url.pathname] : get[url.pathname];
  if (!name) throw Error('此操作不支持在嵌入面板中执行: ' + url.pathname);
  let args = {};
  if (typeof options === 'string') {
    const raw = arguments[2];
    args = (raw && typeof raw === 'object') ? raw : (typeof raw === 'string' ? JSON.parse(raw) : {});
  } else if (options?.body) {
    args = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  }
  if (url.pathname === '/api/browse' || url.pathname === '/api/fs/browse') {
    args = { path: url.searchParams.get('path') || args.path || '' };
  }
  if (url.pathname === '/api/search' || url.pathname === '/api/fs/search') {
    args = { query: url.searchParams.get('q') || args.query || '' };
  }
  if (url.pathname === '/api/connect') {
    args = { paused: false };
  }
  if (url.pathname === '/api/disconnect') {
    args = { paused: true };
  }
  const response = await app.callServerTool({ name, arguments: args });
  const text = (response.content || []).find(x => x.type === 'text')?.text;
  if (response.isError) throw Error(text || '操作失败');
  if (response.structuredContent) return response.structuredContent;
  return JSON.parse(text || '{}');
}
async function confirmAction(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const text = document.createElement('p');
    text.textContent = message;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = '确认';
    cancel.onclick = () => { overlay.remove(); resolve(false); };
    accept.onclick = () => { overlay.remove(); resolve(true); };
    dialog.append(text, cancel, accept);
    overlay.append(dialog);
    document.body.append(overlay);
    cancel.focus();
  });
}
