import { createServer } from 'node:http';
import { readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute, relative, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), 'console');
const settings = [
  'admins', 'allowed_senders', 'invite_policy', 'invite_allowlist',
  'message_policy', 'message_allowlist', 'message_blocklist',
  'federated_room_guard', 'isolate_unbound_rooms', 'admin_only_workspace',
  'redact_sensitive', 'rate_limit_enabled', 'group_reply_all',
  'default_policy', 'cwd', 'auto_join', 'base_dir', 'default_model', 'default_effort'
];
const policies = ['all', 'local_server', 'allowlist', 'none'];

const REPO_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'];
async function inspectDirectoryMeta(dirPath) {
  let is_repo = false;
  let sub_dir_count = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (REPO_MARKERS.includes(ent.name)) is_repo = true;
      if (ent.isDirectory() && !ent.name.startsWith('.')) sub_dir_count++;
    }
  } catch (_) {}
  return { is_repo, sub_dir_count };
}

function cleanConfig(config, settingsState = {}) {
  return {
    invite_policy: config.invite_policy || (config.auto_join ? 'all' : 'none'),
    message_policy: config.message_policy || 'all',
    default_policy: config.default_policy || (config.group_reply_all ? 'all' : 'mention'),
    default_model: settingsState.default_model || '',
    default_effort: settingsState.default_effort || '',
    base_dir: config.cwd,
    ...Object.fromEntries(settings.filter(k => k in config).map(k => [k, config[k]]))
  };
}

function validate(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!settings.includes(k)) throw Error('不支持的配置字段');
    if (['admins', 'allowed_senders', 'invite_allowlist', 'message_allowlist', 'message_blocklist'].includes(k) &&
        (!Array.isArray(v) || v.some(x => typeof x !== 'string') ||
         (k === 'admins' && (!v.length || v.some(x => !/^@[^:*]+:[^*]+$/.test(x)))) ||
         (k === 'allowed_senders' && !v.length))) throw Error('无效名单');
    if (['federated_room_guard', 'isolate_unbound_rooms', 'admin_only_workspace', 'redact_sensitive', 'rate_limit_enabled', 'group_reply_all', 'auto_join'].includes(k) && typeof v !== 'boolean') throw Error('无效开关');
    if (k === 'default_policy' && !['mention', 'all', 'mute'].includes(v)) throw Error('无效默认策略');
    if (k === 'invite_policy' && !policies.includes(v)) throw Error('无效邀请策略');
    if (k === 'message_policy' && ![...policies, 'blocklist'].includes(v)) throw Error('无效消息策略');
    if (k === 'cwd' && (typeof v !== 'string' || !isAbsolute(v))) throw Error('目录必须为绝对路径');
    if (k === 'base_dir' && (typeof v !== 'string' || !isAbsolute(v))) throw Error('目录必须为绝对路径');
  }
}

export function createConsole(bridge, configPath, port) {
  const origin = `http://127.0.0.1:${port}`;
  return createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
    };
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
      res.end(JSON.stringify(data));
    };

    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { error: '无效主机' });
    const url = new URL(req.url, origin);

    if (req.method === 'GET' && ['/', '/app.js', '/styles.css', '/preload.js'].includes(url.pathname)) {
      try {
        if (url.pathname === '/preload.js') {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', ...headers });
          res.end('/* standalone preload */');
          return;
        }
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const data = await readFile(join(base, file));
        res.writeHead(200, {
          'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
          ...headers
        });
        res.end(data);
      } catch {
        reply(404, { error: '未找到' });
      }
      return;
    }

    if (req.method === 'POST' && (req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))) {
      return reply(403, { error: '来源不受信任' });
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const myDomain = (bridge.config.user_id || '').split(':')[1] || '';
        return reply(200, {
          running: bridge.running,
          connected: bridge.running && !bridge.paused && Boolean(bridge.token),
          room_count: Object.keys(bridge.state.rooms).length,
          configured: !!bridge.token,
          paused: !!bridge.paused,
          sync_state: bridge.syncState || (bridge.paused ? 'paused' : 'unknown'),
          last_sync: bridge.lastSyncTime || '',
          homeserver: bridge.config.homeserver,
          server_domain: myDomain,
          user_id: bridge.config.user_id,
          device_id: bridge.config.device_id || '',
          default_policy: bridge.config.default_policy || 'mention',
          default_model: bridge.state.settings?.default_model || '',
          default_effort: bridge.state.settings?.default_effort || '',
          admin_count: (bridge.config.admins || []).length,
          invite_policy: bridge.config.invite_policy || 'all',
          message_policy: bridge.config.message_policy || 'all',
          blocked_rooms: bridge.blockedRooms.size,
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
        cleaned.known_peers = Object.values(bridge.state.rooms).flatMap(r => Object.keys(r.peers || {})).filter((v, i, a) => a.indexOf(v) === i);
        return reply(200, cleaned);
      }

      if (req.method === 'GET' && url.pathname === '/api/logs') {
        return reply(200, { logs: bridge.activity || [] });
      }

      if (req.method === 'GET' && url.pathname === '/api/models') {
        const client = bridge.clientFactory();
        try {
          await client.initialize();
          const models = await client.request('model/list', {});
          return reply(200, {
            models: (models.data || []).map(m => ({ id: m.id, displayName: m.displayName || m.id })),
            settings: bridge.state.settings,
            efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
          });
        } finally {
          client.close();
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/rooms') {
        const myDomain = (bridge.config.user_id || '').split(':')[1] || '';
        const list = Object.entries(bridge.state.rooms).map(([id, r]) => {
          const peerList = Object.keys(r.peers || {});
          const extDomains = peerList.map(p => p.split(':')[1]).filter(d => d && d !== myDomain);
          const is_fed = extDomains.length > 0;
          const otherPeers = peerList.filter(p => p !== (bridge.config.user_id || ''));
          const is_dm = Boolean(
            r.is_direct ||
            r.is_dm ||
            (bridge.directRoomIds && bridge.directRoomIds.has(id)) ||
            (bridge.config.direct_rooms || []).includes(id) ||
            (otherPeers.length === 1 && (!r.name || r.name === 'Codex Mini' || (r.peers && r.name === r.peers[otherPeers[0]])))
          );
          return {
            id,
            name: r.name || id,
            peers: r.peers || {},
            workspace: r.workspace || '',
            policy: r.policy || 'default',
            effective_policy: (r.policy && r.policy !== 'default') ? r.policy : (is_dm ? 'all' : (bridge.config.default_policy || 'mention')),
            model: r.model || '',
            effort: r.effort || '',
            encrypted: !!r.encrypted,
            is_federated: is_fed,
            external_domains: extDomains,
            is_dm,
            member_count: peerList.length || 0,
            blocked: bridge.blockedRooms.has(id),
            migration_candidates: r.migration_candidates || [],
            pending: bridge.state.inbox?.filter(x => x.roomId === id).map(x => ({ id: x.id, status: x.status })) || []
          };
        });
        return reply(200, { rooms: list });
      }

      if (req.method === 'GET' && (url.pathname === '/api/search' || url.pathname === '/api/fs/search')) {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        if (!q) return reply(200, { dirs: [], results: [] });
        const results = [];
        async function walk(dir, depth = 0) {
          if (depth > 3 || results.length >= 40) return;
          try {
            for (const e of await readdir(dir, { withFileTypes: true })) {
              if (!e.isDirectory() || e.name.startsWith('.')) continue;
              const p = join(dir, e.name);
              if (e.name.toLowerCase().includes(q)) results.push(p);
              await walk(p, depth + 1);
            }
          } catch (_) {}
        }
        await walk(bridge.config.cwd);
        const sorted = results.sort();
        return reply(200, {
          query: q,
          dirs: sorted,
          results: sorted.map(p => ({ name: basename(p), path: p, rel_path: relative(bridge.config.cwd, p) }))
        });
      }

      if (req.method === 'GET' && (url.pathname === '/api/browse' || url.pathname === '/api/fs/browse')) {
        const raw = (url.searchParams.get('path') || '').trim();
        const path = raw ? (isAbsolute(raw) ? resolve(raw) : resolve(bridge.config.cwd, raw)) : bridge.config.cwd;
        if (!(await stat(path)).isDirectory()) throw Error('目录不存在');
        const entries = await readdir(path, { withFileTypes: true });
        const subDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
        const dirs = subDirs.map(e => e.name);
        const items = await Promise.all(subDirs.map(async e => {
          const p = join(path, e.name);
          const meta = await inspectDirectoryMeta(p);
          return { name: e.name, path: p, rel_path: relative(bridge.config.cwd, p), ...meta };
        }));
        const parent_path = path === bridge.config.cwd ? '' : dirname(path);
        const crumbs = [];
        let cur = path;
        while (cur && cur.startsWith(bridge.config.cwd)) {
          crumbs.unshift({ name: basename(cur) || '根目录', path: cur });
          if (cur === bridge.config.cwd) break;
          cur = dirname(cur);
        }
        return reply(200, { path, dirs, base_dir: bridge.config.cwd, parent_path, crumbs, items });
      }

      if (req.method === 'GET' && url.pathname === '/api/projects') {
        const entries = await readdir(bridge.config.cwd, { withFileTypes: true }).catch(() => []);
        const projects = [];
        for (const e of entries) {
          if (!e.isDirectory() || e.name.startsWith('.')) continue;
          const p = join(bridge.config.cwd, e.name);
          const meta = await inspectDirectoryMeta(p);
          projects.push({ name: e.name, path: p, ...meta });
        }
        return reply(200, { base_dir: bridge.config.cwd, projects });
      }

      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 65536) throw Error('请求过大');
        }
        const body = JSON.parse(raw || '{}');

        if (url.pathname === '/api/connection' || url.pathname === '/api/connect' || url.pathname === '/api/disconnect') {
          const paused = url.pathname === '/api/disconnect' ? true : url.pathname === '/api/connect' ? false : body.paused;
          if (typeof paused !== 'boolean') throw Error('无效连接状态');
          bridge.setPaused(paused);
          return reply(200, { ok: true, success: true, connected: !paused });
        }

        if (url.pathname === '/api/logout') {
          if (bridge.queues.size || bridge.approvals?.size) throw Error('存在运行中的任务或审批，请先处理');
          bridge.setPaused(true);
          bridge.token = '';
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/auth' || url.pathname === '/api/login' || url.pathname === '/api/verify-token') {
          if (bridge.token) throw Error('已有连接凭证；更换账号请先停止进程');
          let token = body.access_token;
          const homeserver = (body.homeserver || bridge.config.homeserver || '').replace(/\/$/, '');
          if (!token && body.username && body.password) {
            const response = await bridge.fetch(homeserver + '/_matrix/client/v3/login', {
              method: 'POST',
              redirect: 'error',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'm.login.password',
                identifier: { type: 'm.id.user', user: body.username },
                password: body.password,
                initial_device_display_name: 'CODEX-MATRIX-BRIDGE'
              })
            });
            if (!response.ok) throw Error(`Matrix 登录失败 HTTP ${response.status}`);
            token = (await response.json()).access_token;
          }
          if (typeof token !== 'string' || !token) throw Error('请提供令牌或账号密码');
          const result = await bridge.fetch(homeserver + '/_matrix/client/v3/account/whoami', {
            redirect: 'error',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!result.ok) throw Error(`Matrix 身份验证失败 HTTP ${result.status}`);
          const who = await result.json();
          if (who.user_id !== bridge.config.user_id) throw Error('账号与配置不一致');
          bridge.token = token;
          bridge.setPaused(false);
          return reply(200, { ok: true, success: true, user_id: who.user_id, device_id: who.device_id || '' });
        }

        if (url.pathname === '/api/defaults') {
          if (typeof body.model !== 'string' || typeof body.effort !== 'string' || !['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(body.effort)) throw Error('无效模型或思考深度');
          bridge.state.settings ||= {};
          bridge.state.settings.default_model = body.model;
          bridge.state.settings.default_effort = body.effort;
          await bridge.save();
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/config') {
          validate(body);
          if (body.base_dir && !body.cwd) body.cwd = body.base_dir;
          if (body.cwd && !(await stat(body.cwd)).isDirectory()) throw Error('目录不存在');
          if (body.default_model !== undefined || body.default_effort !== undefined) {
            bridge.state.settings ||= {};
            if (body.default_model !== undefined) bridge.state.settings.default_model = body.default_model;
            if (body.default_effort !== undefined) bridge.state.settings.default_effort = body.default_effort;
            await bridge.save();
          }
          const cleanBody = { ...body };
          delete cleanBody.base_dir;
          delete cleanBody.default_model;
          delete cleanBody.default_effort;
          const next = { ...bridge.config, ...cleanBody };
          const temp = configPath + '.' + randomUUID();
          await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
          await rename(temp, configPath);
          Object.assign(bridge.config, cleanBody);
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/migration') {
          const { id, thread_id } = body;
          const room = bridge.state.rooms[id];
          if (!room?.migration_candidates?.some(x => x.thread_id === thread_id)) throw Error('会话候选不存在');
          if (bridge.queues.has(id)) throw Error('房间有正在执行的任务');
          room.thread_id = thread_id;
          delete room.migration_candidates;
          await bridge.save();
          if (!bridge.state.inbox.some(x => x.roomId === id && x.status !== 'queued')) {
            bridge.blockedRooms.delete(id);
            for (const item of bridge.state.inbox) if (item.roomId === id && item.status === 'queued') bridge.enqueue(item);
          }
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/reconcile') {
          const { id, event_id } = body;
          if (!bridge.blockedRooms.has(id)) throw Error('房间未暂停');
          const unknown = bridge.state.inbox.filter(x => x.roomId === id && x.status !== 'queued');
          if (unknown.length !== 1 || unknown[0].id !== event_id) throw Error('待核对事件已变化');
          bridge.state.inbox = bridge.state.inbox.filter(x => x !== unknown[0]);
          await bridge.save();
          bridge.blockedRooms.delete(id);
          for (const item of bridge.state.inbox) if (item.roomId === id && item.status === 'queued') bridge.enqueue(item);
          return reply(200, { ok: true, success: true });
        }

        if (url.pathname === '/api/room' || url.pathname === '/api/rooms/update') {
          const { id, policy, workspace, model, effort, reset_session } = body;
          const room = bridge.state.rooms[id];
          if (!room) throw Error('房间不存在');
          if (bridge.queues.has(id)) throw Error('房间有正在执行的任务');
          if (policy !== undefined && !['default', 'mention', 'all', 'mute'].includes(policy)) throw Error('无效策略');
          if (workspace !== undefined && workspace && (!isAbsolute(workspace) || !(await stat(workspace)).isDirectory())) throw Error('目录不存在');
          if (model !== undefined && typeof model !== 'string') throw Error('无效模型');
          if (effort !== undefined && !['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw Error('无效思考深度');
          if (workspace !== undefined && workspace !== room.workspace) {
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
          await bridge.save();
          return reply(200, { ok: true, success: true, room });
        }

        if (url.pathname === '/api/logs/clear') {
          if (Array.isArray(bridge.activity)) bridge.activity.length = 0;
          return reply(200, { ok: true, success: true });
        }
      }

      return reply(404, { error: '接口不存在' });
    } catch (e) {
      return reply(400, { error: e.message });
    }
  });
}
