import { createServer } from 'node:http';
import { readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute, relative, basename, sep, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Local management console for @matrix-bridge/core.
 *
 * The server is loopback-only, rejects cross-origin writes, keeps credentials
 * out of every response, and exposes a stable REST surface:
 *
 *   GET  /api/status
 *   GET  /api/config              POST /api/config
 *   POST /api/login
 *   GET  /api/rooms               POST /api/rooms/:id
 *   POST /api/rooms/:id/reconcile
 *   GET  /api/models
 *   GET  /api/fs/browse
 *   GET  /api/logs
 *
 * When `staticDir` (constructor option or config.staticDir) points at the built
 * console UI, the same server hosts it on `/`.
 */

const SETTINGS = [
  'admins', 'allowed_senders', 'invite_policy', 'invite_allowlist',
  'message_policy', 'message_allowlist', 'message_blocklist',
  'federated_room_guard', 'isolate_unbound_rooms', 'admin_only_workspace',
  'redact_sensitive', 'rate_limit_enabled', 'group_reply_all',
  'default_policy', 'cwd', 'auto_join', 'base_dir', 'default_model', 'default_effort',
  'agent_cli_cmd', 'codex_cmd', 'agy_cmd', 'zcode_cmd', 'adapter', 'default_room_name',
  'staticDir'
];
const POLICIES = ['all', 'local_server', 'allowlist', 'none'];
const EFFORTS = ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const REPO_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

async function inspectDirectoryMeta(dirPath) {
  let is_repo = false;
  let sub_dir_count = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (REPO_MARKERS.includes(entry.name)) is_repo = true;
      if (entry.isDirectory() && !entry.name.startsWith('.')) sub_dir_count++;
    }
  } catch {
    // Unreadable directories are reported without metadata.
  }
  return { is_repo, sub_dir_count };
}

export function cleanConfig(config = {}, settingsState = {}) {
  return {
    invite_policy: config.invite_policy || (config.auto_join ? 'all' : 'none'),
    message_policy: config.message_policy || 'all',
    default_policy: config.default_policy || (config.group_reply_all ? 'all' : 'mention'),
    default_model: settingsState.default_model || '',
    default_effort: settingsState.default_effort || '',
    base_dir: config.cwd,
    ...Object.fromEntries(SETTINGS.filter((key) => key in config).map((key) => [key, config[key]]))
  };
}

export function validateConfigPatch(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTINGS.includes(key)) throw new Error('不支持的配置字段');
    if (
      ['admins', 'allowed_senders', 'invite_allowlist', 'message_allowlist', 'message_blocklist'].includes(key) &&
      (!Array.isArray(value) || value.some((item) => typeof item !== 'string') ||
        (key === 'admins' && (!value.length || value.some((item) => !/^@[^:*]+:[^*]+$/.test(item)))) ||
        (key === 'allowed_senders' && !value.length))
    ) throw new Error('无效名单');
    if (
      ['federated_room_guard', 'isolate_unbound_rooms', 'admin_only_workspace', 'redact_sensitive',
        'rate_limit_enabled', 'group_reply_all', 'auto_join'].includes(key) &&
      typeof value !== 'boolean'
    ) throw new Error('无效开关');
    if (key === 'default_policy' && !['mention', 'all', 'mute'].includes(value)) throw new Error('无效默认策略');
    if (key === 'invite_policy' && !POLICIES.includes(value)) throw new Error('无效邀请策略');
    if (key === 'message_policy' && ![...POLICIES, 'blocklist'].includes(value)) throw new Error('无效消息策略');
    if (key === 'staticDir' && value === '') continue;
    if (['cwd', 'base_dir', 'staticDir'].includes(key) && (typeof value !== 'string' || !isAbsolute(value))) {
      throw new Error('目录必须为绝对路径');
    }
    if (['agent_cli_cmd', 'codex_cmd', 'agy_cmd', 'zcode_cmd', 'adapter', 'default_room_name'].includes(key) &&
        typeof value !== 'string') throw new Error('无效字符串配置');
  }
}

function contentTypeFor(file) {
  return CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
}

export function createConsole(coreEngine, configPath, port, options = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const staticDir = options.staticDir || coreEngine.config?.staticDir || coreEngine.config?.static_dir || coreEngine.config?.console_static_dir || '';
  const staticRoot = staticDir ? resolve(staticDir) : '';
  const customOrigins = new Set(options.allowedOrigins || []);
  const customHosts = new Set(options.allowedHosts || []);
  const securityHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'"
  };

  async function serveStatic(pathname, res) {
    if (pathname === '/preload.js' && !staticRoot) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', ...securityHeaders });
      res.end('/* standalone preload */');
      return true;
    }
    if (!staticRoot) return false;
    let rel;
    try {
      rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
    } catch {
      return false;
    }
    if (!rel || rel.includes('\0') || rel.split('/').includes('..')) return false;
    const target = resolve(staticRoot, rel);
    if (target !== staticRoot && !target.startsWith(staticRoot + sep)) return false;
    try {
      const info = await stat(target);
      if (!info.isFile()) return false;
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': contentTypeFor(target), ...securityHeaders });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  async function updateRoom(id, body = {}) {
    const bridge = coreEngine;
    const room = bridge.state.rooms[id];
    if (!room) throw new Error('房间不存在');
    if (bridge.queues?.has(id)) throw new Error('房间有正在执行的任务');
    const { policy, workspace, model, effort, reset_session } = body;
    if (policy !== undefined && !['default', 'mention', 'all', 'mute'].includes(policy)) throw new Error('无效策略');
    if (workspace !== undefined && workspace && (!isAbsolute(workspace) || !(await stat(workspace)).isDirectory())) {
      throw new Error('目录不存在');
    }
    if (model !== undefined && typeof model !== 'string') throw new Error('无效模型');
    if (effort !== undefined && !EFFORTS.includes(effort)) throw new Error('无效思考深度');
    const oldThread = room.thread_id || '';
    const workspaceChanged = workspace !== undefined && workspace !== room.workspace;
    if (workspaceChanged) {
      room.thread_id = '';
      room.thread_sessions = {};
      room.sessions = {};
      room.active_session = '';
      room.workspace = workspace;
    }
    if (reset_session) {
      room.thread_id = '';
      room.thread_sessions = {};
      room.sessions = {};
      room.active_session = '';
    }
    if (policy !== undefined) room.policy = policy;
    if (model !== undefined) room.model = model;
    if (effort !== undefined) room.effort = effort;
    await bridge.save?.();
    if ((reset_session || workspaceChanged) && typeof bridge.adapter?.resetSession === 'function') {
      try {
        await bridge.adapter.resetSession(id, oldThread);
      } catch {
        // Context reset is best effort; room state is already cleared.
      }
    }
    return room;
  }

  async function reconcileRoom(id, eventId) {
    const bridge = coreEngine;
    if (!bridge.blockedRooms?.has(id)) throw new Error('房间未暂停');
    const unknown = bridge.state.inbox.filter((item) => item.roomId === id && item.status !== 'queued');
    if (unknown.length !== 1 || unknown[0].id !== eventId) throw new Error('待核对事件已变化');
    bridge.state.inbox = bridge.state.inbox.filter((item) => item !== unknown[0]);
    await bridge.save?.();
    bridge.blockedRooms.delete(id);
    for (const item of bridge.state.inbox) {
      if (item.roomId === id && item.status === 'queued') bridge.enqueue?.(item);
    }
  }

  async function migrateRoom(id, threadId) {
    const bridge = coreEngine;
    const room = bridge.state.rooms[id];
    if (!room?.migration_candidates?.some((candidate) => candidate.thread_id === threadId)) throw new Error('会话候选不存在');
    if (bridge.queues?.has(id)) throw new Error('房间有正在执行的任务');
    room.thread_id = threadId;
    delete room.migration_candidates;
    await bridge.save?.();
    if (!bridge.state.inbox.some((item) => item.roomId === id && item.status !== 'queued')) {
      bridge.blockedRooms?.delete(id);
      for (const item of bridge.state.inbox) {
        if (item.roomId === id && item.status === 'queued') bridge.enqueue?.(item);
      }
    }
  }

  async function login(body) {
    const bridge = coreEngine;
    if (bridge.token) throw new Error('已有连接凭证；更换账号请先停止进程');
    let token = body.access_token;
    const homeserver = (body.homeserver || bridge.config.homeserver || '').replace(/\/$/, '');
    if (!homeserver) throw new Error('请提供 homeserver');
    if (!token && body.username && body.password) {
      const response = await bridge.fetch(homeserver + '/_matrix/client/v3/login', {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'm.login.password',
          identifier: { type: 'm.id.user', user: body.username },
          password: body.password,
          initial_device_display_name: 'MATRIX-BRIDGE'
        })
      });
      if (!response.ok) throw new Error(`Matrix 登录失败 HTTP ${response.status}`);
      token = (await response.json()).access_token;
    }
    if (typeof token !== 'string' || !token) throw new Error('请提供令牌或账号密码');
    const result = await bridge.fetch(homeserver + '/_matrix/client/v3/account/whoami', {
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!result.ok) throw new Error(`Matrix 身份验证失败 HTTP ${result.status}`);
    const who = await result.json();
    if (who.user_id !== bridge.config.user_id) throw new Error('账号与配置不一致');
    bridge.token = token;
    bridge.setPaused?.(false);
    return { user_id: who.user_id, device_id: who.device_id || '' };
  }

  return createServer(async (req, res) => {
    const originHeader = req.headers.origin;
    const corsHeaders = {};
    if (originHeader && (customOrigins.has(originHeader) || originHeader.startsWith('zcode-sandbox://') || originHeader.startsWith('http://localhost') || originHeader.startsWith('http://127.0.0.1') || originHeader === 'null')) {
      corsHeaders['Access-Control-Allow-Origin'] = originHeader;
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sidecar-Token',
        ...corsHeaders,
        ...securityHeaders
      });
      res.end();
      return;
    }

    const reply = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders,
        ...securityHeaders
      });
      res.end(JSON.stringify(data));
    };

    const hostHeader = String(req.headers.host || '');
    const hostName = hostHeader.startsWith('[')
      ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
      : hostHeader.split(':')[0];
    const loopbackHost = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostName);
    if (!loopbackHost && !customHosts.has(hostHeader)) return reply(403, { error: '无效主机' });
    const url = new URL(req.url, origin);

    if (req.method === 'GET' && await serveStatic(url.pathname, res)) return;

    if (req.method === 'POST') {
      const requestOrigin = req.headers.origin;
      const portFromHost = hostHeader.includes(':') ? hostHeader.slice(hostHeader.lastIndexOf(':') + 1) : '';
      const allowedOrigins = new Set([
        origin,
        `http://127.0.0.1:${portFromHost}`,
        `http://localhost:${portFromHost}`,
        `http://[::1]:${portFromHost}`,
        'null',
        ...customOrigins
      ]);
      if (requestOrigin && !allowedOrigins.has(requestOrigin) && !requestOrigin.startsWith('zcode-sandbox://')) return reply(403, { error: '来源不受信任' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        return reply(403, { error: '来源不受信任' });
      }
    }

    try {
      const bridge = coreEngine;

      if (req.method === 'GET' && url.pathname === '/api/status') {
        const myDomain = (bridge.config.user_id || '').split(':')[1] || '';
        return reply(200, {
          running: bridge.running,
          connected: bridge.running && !bridge.paused && Boolean(bridge.token),
          room_count: Object.keys(bridge.state.rooms || {}).length,
          configured: !!bridge.token,
          paused: !!bridge.paused,
          sync_state: bridge.syncState || (bridge.paused ? 'paused' : 'unknown'),
          last_sync: bridge.lastSyncTime || '',
          homeserver: bridge.config.homeserver,
          server_domain: myDomain,
          user_id: bridge.config.user_id,
          device_id: bridge.config.device_id || '',
          adapter: bridge.adapter?.name || 'generic',
          agent_cli: bridge.adapter?.defaultCliPath || '',
          default_policy: bridge.config.default_policy || 'mention',
          default_model: bridge.state.settings?.default_model || '',
          default_effort: bridge.state.settings?.default_effort || '',
          admin_count: (bridge.config.admins || []).length,
          invite_policy: bridge.config.invite_policy || 'all',
          message_policy: bridge.config.message_policy || 'all',
          blocked_rooms: bridge.blockedRooms?.size || 0,
          has_checkpoint: !!bridge.state.next_batch
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        const cleaned = cleanConfig(bridge.config, bridge.state.settings);
        cleaned.homeserver = bridge.config.homeserver;
        cleaned.user_id = bridge.config.user_id;
        cleaned.username = bridge.config.username || (bridge.config.user_id || '').split(':')[0].replace(/^@/, '');
        cleaned.has_token = !!bridge.token;
        cleaned.server_domain = (bridge.config.user_id || '').split(':')[1] || '';
        cleaned.adapter = bridge.adapter?.name || 'generic';
        cleaned.known_peers = Object.values(bridge.state.rooms || {})
          .flatMap((room) => Object.keys(room.peers || {}))
          .filter((value, index, all) => all.indexOf(value) === index);
        return reply(200, cleaned);
      }

      if (req.method === 'GET' && url.pathname === '/api/logs') {
        return reply(200, { logs: bridge.activity || [] });
      }

      if (req.method === 'GET' && url.pathname === '/api/models') {
        const catalog = typeof bridge.adapter?.listAvailableModels === 'function'
          ? await bridge.adapter.listAvailableModels()
          : { models: [], efforts: [] };
        return reply(200, {
          adapter: bridge.adapter?.name || 'generic',
          models: Array.isArray(catalog?.models) ? catalog.models : [],
          efforts: Array.isArray(catalog?.efforts) ? catalog.efforts : [],
          settings: bridge.state.settings || {}
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/rooms') {
        const myDomain = (bridge.config.user_id || '').split(':')[1] || '';
        const list = Object.entries(bridge.state.rooms || {}).map(([id, room]) => {
          const peerList = Object.keys(room.peers || {});
          const extDomains = peerList.map((peer) => peer.split(':')[1]).filter((item) => item && item !== myDomain);
          const otherPeers = peerList.filter((peer) => peer !== (bridge.config.user_id || ''));
          const is_dm = Boolean(
            room.is_direct ||
            room.is_dm ||
            (bridge.directRoomIds && bridge.directRoomIds.has(id)) ||
            (bridge.config.direct_rooms || []).includes(id) ||
            (otherPeers.length === 1 && (!room.name || room.name === (bridge.config.default_room_name || '') || (room.peers && room.name === room.peers[otherPeers[0]])))
          );
          return {
            id,
            name: room.name || id,
            peers: room.peers || {},
            workspace: room.workspace || '',
            policy: room.policy || 'default',
            effective_policy: room.policy && room.policy !== 'default'
              ? room.policy
              : (is_dm ? 'all' : (bridge.config.default_policy || 'mention')),
            model: room.model || '',
            effort: room.effort || '',
            encrypted: !!room.encrypted,
            is_federated: extDomains.length > 0,
            external_domains: extDomains,
            is_dm,
            member_count: peerList.length || 0,
            blocked: bridge.blockedRooms?.has(id) || false,
            migration_candidates: room.migration_candidates || [],
            pending: (bridge.state.inbox || [])
              .filter((item) => item.roomId === id)
              .map((item) => ({ id: item.id, status: item.status }))
          };
        });
        return reply(200, { rooms: list });
      }

      if (req.method === 'GET' && (url.pathname === '/api/search' || url.pathname === '/api/fs/search')) {
        const query = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (!query) return reply(200, { dirs: [], results: [] });
        const results = [];
        async function walk(dir, depth = 0) {
          if (depth > 3 || results.length >= 40) return;
          try {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
              if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
              const target = join(dir, entry.name);
              if (entry.name.toLowerCase().includes(query)) results.push(target);
              await walk(target, depth + 1);
            }
          } catch {
            // Skip unreadable directories.
          }
        }
        await walk(bridge.config.cwd);
        const sorted = results.sort();
        return reply(200, {
          query,
          dirs: sorted,
          results: sorted.map((target) => ({ name: basename(target), path: target, rel_path: relative(bridge.config.cwd, target) }))
        });
      }

      if (req.method === 'GET' && (url.pathname === '/api/browse' || url.pathname === '/api/fs/browse')) {
        const raw = (url.searchParams.get('path') || '').trim();
        const path = raw ? (isAbsolute(raw) ? resolve(raw) : resolve(bridge.config.cwd, raw)) : bridge.config.cwd;
        if (!(await stat(path)).isDirectory()) throw new Error('目录不存在');
        const entries = await readdir(path, { withFileTypes: true });
        const subDirs = entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name));
        const items = await Promise.all(subDirs.map(async (entry) => {
          const target = join(path, entry.name);
          const meta = await inspectDirectoryMeta(target);
          return { name: entry.name, path: target, rel_path: relative(bridge.config.cwd, target), ...meta };
        }));
        const parent_path = path === bridge.config.cwd ? '' : dirname(path);
        const crumbs = [];
        let current = path;
        while (current && current.startsWith(bridge.config.cwd)) {
          crumbs.unshift({ name: basename(current) || '根目录', path: current });
          if (current === bridge.config.cwd) break;
          current = dirname(current);
        }
        return reply(200, {
          path,
          dirs: subDirs.map((entry) => entry.name),
          base_dir: bridge.config.cwd,
          parent_path,
          crumbs,
          items
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/projects') {
        const entries = await readdir(bridge.config.cwd, { withFileTypes: true }).catch(() => []);
        const projects = [];
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const target = join(bridge.config.cwd, entry.name);
          const meta = await inspectDirectoryMeta(target);
          projects.push({ name: entry.name, path: target, ...meta });
        }
        return reply(200, { base_dir: bridge.config.cwd, projects });
      }

      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 65536) throw new Error('请求过大');
        }
        const body = JSON.parse(raw || '{}');

        if (url.pathname === '/api/connection' || url.pathname === '/api/connect' || url.pathname === '/api/disconnect') {
          const paused = url.pathname === '/api/disconnect' ? true : url.pathname === '/api/connect' ? false : body.paused;
          if (typeof paused !== 'boolean') throw new Error('无效连接状态');
          bridge.setPaused?.(paused);
          return reply(200, { ok: true, success: true, connected: !paused });
        }

        if (url.pathname === '/api/logout') {
          if (bridge.queues?.size || bridge.approvals?.size) throw new Error('存在运行中的任务或审批，请先处理');
          bridge.setPaused?.(true);
          bridge.token = '';
          return reply(200, { ok: true, success: true });
        }

        if (['/api/auth', '/api/login', '/api/verify-token'].includes(url.pathname)) {
          const who = await login(body);
          return reply(200, { ok: true, success: true, ...who });
        }

        if (url.pathname === '/api/defaults') {
          if (typeof body.model !== 'string' || typeof body.effort !== 'string' || !EFFORTS.includes(body.effort)) {
            throw new Error('无效模型或思考深度');
          }
          bridge.state.settings ||= {};
          bridge.state.settings.default_model = body.model;
          bridge.state.settings.default_effort = body.effort;
          await bridge.save?.();
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/config') {
          validateConfigPatch(body);
          if (body.base_dir && !body.cwd) body.cwd = body.base_dir;
          if (body.cwd && !(await stat(body.cwd)).isDirectory()) throw new Error('目录不存在');
          if (body.staticDir && !(await stat(body.staticDir)).isDirectory()) throw new Error('目录不存在');
          if (body.default_model !== undefined || body.default_effort !== undefined) {
            bridge.state.settings ||= {};
            if (body.default_model !== undefined) bridge.state.settings.default_model = body.default_model;
            if (body.default_effort !== undefined) bridge.state.settings.default_effort = body.default_effort;
            await bridge.save?.();
          }
          const cleanBody = { ...body };
          delete cleanBody.base_dir;
          delete cleanBody.default_model;
          delete cleanBody.default_effort;
          const next = { ...bridge.config, ...cleanBody };
          if (configPath) {
            const temp = configPath + '.' + randomUUID();
            await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
            await rename(temp, configPath);
          }
          Object.assign(bridge.config, cleanBody);
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/migration') {
          await migrateRoom(body.id, body.thread_id);
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/reconcile') {
          await reconcileRoom(body.id, body.event_id);
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/room' || url.pathname === '/api/rooms/update') {
          const room = await updateRoom(body.id, body);
          return reply(200, { ok: true, success: true, room });
        }

        const roomRoute = /^\/api\/rooms\/([^/]+)(\/reconcile)?$/.exec(url.pathname);
        if (roomRoute) {
          const id = decodeURIComponent(roomRoute[1]);
          if (roomRoute[2]) {
            await reconcileRoom(id, body.event_id);
            return reply(200, { ok: true, success: true });
          }
          const room = await updateRoom(id, body);
          return reply(200, { ok: true, success: true, room });
        }

        if (url.pathname === '/api/logs/clear') {
          if (Array.isArray(bridge.activity)) bridge.activity.length = 0;
          return reply(200, { ok: true, success: true });
        }
      }

      return reply(404, { error: '接口不存在' });
    } catch (error) {
      return reply(400, { error: error.message });
    }
  });
}
