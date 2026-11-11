import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, isAbsolute, basename, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 持久化目录与受限沙箱目录
const DATA_DIR = join(homedir(), '.zcode', 'matrix-bridge');
const LOG_DIR = join(DATA_DIR, 'logs');
const SANDBOX_DIR = join(DATA_DIR, 'sandbox');
const ATTACHMENTS_DIR = join(DATA_DIR, 'attachments');
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
if (!existsSync(SANDBOX_DIR)) {
  mkdirSync(SANDBOX_DIR, { recursive: true });
}
if (!existsSync(ATTACHMENTS_DIR)) {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

const CONFIG_PATH = join(DATA_DIR, 'config.json');
const ROOMS_PATH = join(DATA_DIR, 'rooms.json');

const VALID_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const VALID_INVITE_POLICIES = ['all', 'local_server', 'allowlist', 'none'];
const VALID_MESSAGE_POLICIES = ['all', 'local_server', 'allowlist', 'blocklist', 'none'];

const FALLBACK_MODELS = [
  { id: 'zai/glm-5', name: 'GLM-5 (Z.AI Flagship)' },
  { id: 'zai/glm-4.5', name: 'GLM-4.5' },
  { id: 'zai/glm-4.5-air', name: 'GLM-4.5 Air (Fast)' },
  { id: 'anthropic/claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' }
];

// 运行日志环形缓冲
const MAX_LOGS = 300;
const logs = [];
function log(level, message, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    level, // 'info' | 'msg' | 'sec' | 'warn' | 'error'
    message,
    data
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  const dataStr = Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
  console.log(`[${entry.time}] [${level.toUpperCase()}] ${message}${dataStr}`);
}

// 媒体类型与扩展名映射
const MIME_EXT_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/gzip': '.tar.gz',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

const EXT_MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.tar.gz': 'application/gzip',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function detectMimeType(filePath) {
  const ext = (filePath.match(/\.[a-z0-9.]+$/i)?.[0] || '').toLowerCase();
  return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

function getExtensionFromMime(mime) {
  const cleanMime = String(mime || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT_MAP[cleanMime] || '';
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function sanitizeFilename(name) {
  const clean = basename(String(name || 'attachment')).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
  return clean || 'attachment';
}

function getImageDimensions(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR chunk at offset 12..24
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504E47 && buf.readUInt32BE(4) === 0x0D0A1A0A) {
      if (buf.toString('ascii', 12, 16) === 'IHDR') {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return { width, height };
      }
    }
    // JPEG: 0xFFD8
    if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xFF) { offset++; continue; }
        const marker = buf[offset + 1];
        if (marker === 0xD9 || marker === 0xDA) break;
        const len = buf.readUInt16BE(offset + 2);
        if ([0xC0, 0xC1, 0xC2].includes(marker) && offset + 2 + len <= buf.length) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height };
        }
        offset += 2 + len;
      }
    }
  } catch (_) {}
  return null;
}

function normalizeHomeserver(raw) {
  let hs = String(raw || '').trim().replace(/\/+$/, '');
  if (hs && !/^https?:\/\//i.test(hs)) {
    hs = 'https://' + hs;
  }
  return hs;
}

function inferServerDomain(cfg) {
  if (cfg?.user_id && cfg.user_id.includes(':')) {
    return cfg.user_id.split(':').slice(1).join(':').trim();
  }
  if (cfg?.homeserver) {
    try {
      const u = new URL(normalizeHomeserver(cfg.homeserver));
      return u.hostname;
    } catch (_) {}
  }
  return '';
}

function extractEntityDomain(id) {
  const s = String(id || '').trim();
  if (!s.includes(':')) return '';
  return s.split(':').slice(1).join(':').toLowerCase().trim();
}

function normalizeMxid(raw, serverDomain = '', allowDomainWildcard = false) {
  const s = String(raw || '').trim();
  if (!s || s === '*') return ''; // 严禁全量 * 通配符

  // 支持在普通黑白名单中配置整服域名规则，如 @*:matrix.org 或 *:matrix.org
  if (allowDomainWildcard) {
    if (s.startsWith('@*:') && s.length > 3) {
      return `@*:${s.slice(3).toLowerCase()}`;
    }
    if (s.startsWith('*:') && s.length > 2) {
      return `@*:${s.slice(2).toLowerCase()}`;
    }
  } else if (s.includes('*')) {
    // 管理员列表严禁任何通配符
    return '';
  }

  if (s.startsWith('@') && s.includes(':')) return s;
  if (!s.startsWith('@') && s.includes(':')) return `@${s}`;
  const local = s.replace(/^@/, '');
  if (!local || local.includes('*')) return '';
  return serverDomain ? `@${local}:${serverDomain}` : `@${local}`;
}

function normalizeMxidList(input, serverDomain = '', allowDomainWildcard = false) {
  const arr = Array.isArray(input)
    ? input
    : String(input || '').split(/[\s,，;；\n]+/);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const norm = normalizeMxid(item, serverDomain, allowDomainWildcard);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function sanitizeOutboundText(text, enableRedact = true) {
  let out = String(text || '');
  if (!enableRedact || !out) return out;

  // 1. 脱敏宿主机用户主目录路径 (/Users/xxx -> ~)
  const home = homedir();
  if (home && home.length > 1) {
    out = out.split(home).join('~');
  }

  // 2. 脱敏常见敏感凭证与私钥
  out = out
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[PRIVATE_KEY_REDACTED]')
    .replace(/\bsyt_[A-Za-z0-9._~-]{10,}\b/g, 'syt_[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, 'sk-[REDACTED]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[GITHUB_TOKEN_REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, 'AIza[REDACTED]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{15,}\b/g, 'xox-[REDACTED]');

  return out;
}

function loadConfig() {
  const defaults = {
    homeserver: 'https://matrix.bigbear.cool:8443',
    username: '',
    user_id: '',
    device_id: '',
    access_token: '',
    base_dir: join(homedir(), '开发项目'),
    default_policy: 'mention', // 'mention' | 'all' | 'mute'
    default_model: '',
    default_effort: '', // '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    // 1. 房间邀请准入策略
    invite_policy: 'all', // 'all' | 'local_server' | 'allowlist' | 'none'
    invite_allowlist: [],
    // 2. 管理员账号白名单
    admins: [],
    // 3. 接收消息过滤策略
    message_policy: 'all', // 'all' | 'local_server' | 'allowlist' | 'blocklist' | 'none'
    message_allowlist: [],
    message_blocklist: [],
    // 4. 联邦与隐私纵深防护策略
    federated_room_guard: true, // 群内含外部联邦服务器成员时禁止执行与回复
    isolate_unbound_rooms: true, // 未绑定目录的房间强制在受限沙箱目录运行
    admin_only_workspace: false, // 仅管理员可触发绑定工作区的代码执行
    redact_sensitive: true, // 出站回复自动脱敏本机路径与密钥
    rate_limit_enabled: true, // 非管理员防洪限流与超长消息拦截
    zcode_cmd: join(homedir(), '.local', 'bin', 'agy'),
    auto_connect: true
  };

  if (existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      delete saved.password;
      if (!saved.invite_policy && typeof saved.auto_join === 'boolean') {
        saved.invite_policy = saved.auto_join ? 'all' : 'none';
      }
      delete saved.auto_join;
      delete saved.admin_from;

      const merged = { ...defaults, ...saved };
      const domain = inferServerDomain(merged);
      merged.admins = normalizeMxidList(merged.admins, domain, false);
      merged.invite_allowlist = normalizeMxidList(merged.invite_allowlist, domain, true);
      merged.message_allowlist = normalizeMxidList(merged.message_allowlist, domain, true);
      merged.message_blocklist = normalizeMxidList(merged.message_blocklist, domain, true);
      return merged;
    } catch (e) {
      log('warn', '配置文件解析失败，已回退默认配置', { error: e.message });
    }
  }
  return defaults;
}

function saveConfig(cfg) {
  const clean = { ...cfg };
  delete clean.password;
  delete clean.auto_join;
  writeFileSync(CONFIG_PATH, JSON.stringify(clean, null, 2), 'utf-8');
}

function loadRooms() {
  if (existsSync(ROOMS_PATH)) {
    try {
      return JSON.parse(readFileSync(ROOMS_PATH, 'utf-8'));
    } catch (e) {
      log('warn', '房间状态文件解析失败', { error: e.message });
    }
  }
  return {};
}

function saveRooms(rooms) {
  writeFileSync(ROOMS_PATH, JSON.stringify(rooms, null, 2), 'utf-8');
}

// 动态获取并缓存 agy 可用模型列表
let cachedModels = null;
let cachedModelsAt = 0;

function fetchAvailableModels(zcodeBin) {
  return new Promise((resolve) => {
    resolve(FALLBACK_MODELS);
  });
}

// ---------- 多级工作目录浏览与递归搜索 ----------
const SYSTEM_MEDIA_DIRS = new Set([
  'Applications', 'Library', 'Movies', 'Music', 'Pictures', 'Public', 'Downloads'
]);

const IGNORED_SEARCH_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'Library', 'Applications', 'Movies',
  'Music', 'Pictures', 'Public', '.Trash', 'venv', '.venv', '__pycache__',
  'dist', 'build', 'target', 'vendor', 'Pods', 'DerivedData', '.next', '.nuxt',
  '.cache', '.gradle', '.idea', '.vscode'
]);

const REPO_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'];

function inspectDirectoryMeta(dirPath) {
  let isRepo = false;
  let subCount = 0;
  try {
    for (const marker of REPO_MARKERS) {
      if (existsSync(join(dirPath, marker))) {
        isRepo = true;
        break;
      }
    }
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      if (ent.isDirectory()) {
        subCount++;
        if (subCount >= 99) break;
      }
    }
  } catch (_) {}
  return { is_repo: isRepo, sub_count: subCount };
}

function resolveUserPath(rawPath, baseDir) {
  const s = String(rawPath || '').trim();
  const normBase = resolve(baseDir && existsSync(baseDir) ? baseDir : homedir());
  if (!s) return normBase;
  if (s === '~') return homedir();
  if (s.startsWith('~/') || s.startsWith('~\\')) {
    return resolve(homedir(), s.slice(2));
  }
  if (isAbsolute(s)) {
    return resolve(s);
  }
  return resolve(normBase, s);
}

function browseDirectory(requestedPath, rawBaseDir) {
  const baseDir = resolve(rawBaseDir && existsSync(rawBaseDir) ? rawBaseDir : homedir());
  let curPath = resolveUserPath(requestedPath, baseDir);
  try {
    if (!existsSync(curPath) || !statSync(curPath).isDirectory()) {
      curPath = baseDir;
    }
  } catch (_) {
    curPath = baseDir;
  }

  const isBase = curPath === baseDir;
  const isWithinBase = isBase || curPath.startsWith(baseDir + sep);
  const parentPath = dirname(curPath) !== curPath ? dirname(curPath) : '';

  // 构建面包屑路径
  const breadcrumbs = [];
  if (isWithinBase) {
    breadcrumbs.push({ name: '默认目录', path: baseDir, is_base: true });
    const rel = relative(baseDir, curPath);
    if (rel) {
      const parts = rel.split(sep).filter(Boolean);
      let acc = baseDir;
      for (const part of parts) {
        acc = join(acc, part);
        breadcrumbs.push({ name: part, path: acc, is_base: false });
      }
    }
  } else {
    breadcrumbs.push({ name: '/', path: '/', is_base: false });
    const parts = curPath.split(sep).filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc + sep + part;
      breadcrumbs.push({ name: part, path: acc, is_base: false });
    }
  }

  const dirs = [];
  try {
    const entries = readdirSync(curPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const fullPath = join(curPath, ent.name);
      let isDir = ent.isDirectory();
      if (!isDir && ent.isSymbolicLink()) {
        try { isDir = statSync(fullPath).isDirectory(); } catch (_) {}
      }
      if (!isDir) continue;

      const meta = inspectDirectoryMeta(fullPath);
      const isSys = curPath === homedir() && SYSTEM_MEDIA_DIRS.has(ent.name);
      dirs.push({
        name: ent.name,
        path: fullPath,
        rel_path: isWithinBase ? relative(baseDir, fullPath) : fullPath,
        is_repo: meta.is_repo,
        sub_count: meta.sub_count,
        is_system: isSys
      });
    }
  } catch (_) {}

  dirs.sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? 1 : -1;
    if (a.is_repo !== b.is_repo) return a.is_repo ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  const curMeta = inspectDirectoryMeta(curPath);

  return {
    base_dir: baseDir,
    current_path: curPath,
    current_name: isBase ? (basename(baseDir) || baseDir) : basename(curPath),
    rel_current: isWithinBase ? (relative(baseDir, curPath) || '.') : curPath,
    is_base: isBase,
    is_within_base: isWithinBase,
    is_repo: curMeta.is_repo,
    parent_path: parentPath,
    breadcrumbs,
    dirs
  };
}

function searchDirectories(rawBaseDir, query, maxDepth = 4, maxResults = 45) {
  const baseDir = resolve(rawBaseDir && existsSync(rawBaseDir) ? rawBaseDir : homedir());
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { base_dir: baseDir, query: '', results: [] };

  const results = [];
  const queue = [{ dir: baseDir, depth: 0 }];

  while (queue.length > 0 && results.length < maxResults) {
    const { dir, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      if (IGNORED_SEARCH_DIRS.has(ent.name)) continue;

      const fullPath = join(dir, ent.name);
      let isDir = ent.isDirectory();
      if (!isDir && ent.isSymbolicLink()) {
        try { isDir = statSync(fullPath).isDirectory(); } catch (_) {}
      }
      if (!isDir) continue;

      const relPath = relative(baseDir, fullPath);
      const hay = `${ent.name} ${relPath}`.toLowerCase();
      if (hay.includes(q)) {
        const meta = inspectDirectoryMeta(fullPath);
        results.push({
          name: ent.name,
          rel_path: relPath,
          path: fullPath,
          depth: depth + 1,
          is_repo: meta.is_repo,
          sub_count: meta.sub_count
        });
        if (results.length >= maxResults) break;
      }

      if (depth + 1 < maxDepth) {
        queue.push({ dir: fullPath, depth: depth + 1 });
      }
    }
  }

  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === q ? 0 : 1;
    const bExact = b.name.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.rel_path.localeCompare(b.rel_path, 'zh-CN');
  });

  return { base_dir: baseDir, query: q, results };
}

function scanProjects(baseDir) {
  const browsed = browseDirectory(baseDir, baseDir);
  return browsed.dirs.filter(d => !d.is_system).map(d => ({
    name: d.name,
    path: d.path,
    is_repo: d.is_repo,
    sub_count: d.sub_count
  }));
}

// ---------- Matrix 直连客户端引擎 ----------
class MatrixBotEngine {
  constructor() {
    this.config = loadConfig();
    this.rooms = loadRooms();
    this.connected = false;
    this.syncState = 'offline'; // 'offline' | 'connecting' | 'online' | 'error'
    this.lastError = '';
    this.syncing = false;
    this.abortController = null;
    this.nextBatch = '';
    this.connectedAt = 0;
    this.directRoomIds = new Set();
    this.processedEvents = new Set();
    this.processedInvites = new Set();
    this.roomQueues = new Map();
    this.senderRateMap = new Map();
    this.recentBotEventIds = new Set();
    this.knownBots = ['claude-mini', 'codex-mini-bot', 'dsh-mini-bot', 'claude-win'];
  }

  recordBotEventId(eventId) {
    if (!eventId) return;
    this.recentBotEventIds.add(eventId);
    if (this.recentBotEventIds.size > 1000) {
      const arr = Array.from(this.recentBotEventIds);
      this.recentBotEventIds = new Set(arr.slice(arr.length - 500));
    }
  }

  getServerDomain() {
    return inferServerDomain(this.config);
  }

  isLocalServerUser(mxid) {
    const myDomain = this.getServerDomain().toLowerCase();
    const userDomain = extractEntityDomain(mxid);
    if (!myDomain || !userDomain) return false;
    return userDomain === myDomain;
  }

  updateConfig(patch) {
    const next = { ...this.config, ...patch };
    if (patch.homeserver !== undefined) {
      next.homeserver = normalizeHomeserver(patch.homeserver);
    }
    const domain = inferServerDomain(next);
    if (patch.admins !== undefined) {
      next.admins = normalizeMxidList(patch.admins, domain, false);
    }
    if (patch.invite_allowlist !== undefined) {
      next.invite_allowlist = normalizeMxidList(patch.invite_allowlist, domain, true);
    }
    if (patch.message_allowlist !== undefined) {
      next.message_allowlist = normalizeMxidList(patch.message_allowlist, domain, true);
    }
    if (patch.message_blocklist !== undefined) {
      next.message_blocklist = normalizeMxidList(patch.message_blocklist, domain, true);
    }
    if (patch.invite_policy !== undefined && !VALID_INVITE_POLICIES.includes(patch.invite_policy)) {
      next.invite_policy = 'all';
    }
    if (patch.message_policy !== undefined && !VALID_MESSAGE_POLICIES.includes(patch.message_policy)) {
      next.message_policy = 'all';
    }
    if (patch.default_effort !== undefined && patch.default_effort !== '' && !VALID_EFFORTS.includes(patch.default_effort)) {
      next.default_effort = '';
    }
    for (const boolKey of [
      'federated_room_guard',
      'isolate_unbound_rooms',
      'admin_only_workspace',
      'redact_sensitive',
      'rate_limit_enabled'
    ]) {
      if (patch[boolKey] !== undefined) {
        next[boolKey] = Boolean(patch[boolKey]);
      }
    }
    delete next.password;
    this.config = next;
    saveConfig(this.config);
  }

  isUserInList(mxid, list, allowDomainWildcard = true) {
    if (!mxid || !Array.isArray(list) || list.length === 0) return false;
    const target = mxid.toLowerCase();
    const userDomain = extractEntityDomain(mxid);
    for (const item of list) {
      const rule = String(item || '').toLowerCase();
      if (rule === target) return true;
      if (allowDomainWildcard && userDomain && rule === `@*:${userDomain}`) {
        return true;
      }
    }
    return false;
  }

  isAdmin(mxid) {
    return this.isUserInList(mxid, this.config.admins, false);
  }

  getRoomFederationInfo(room, roomId = '') {
    const myDomain = this.getServerDomain().toLowerCase();
    const rId = roomId || room?.id || '';
    const externalDomains = new Set();
    const externalPeers = [];

    if (myDomain) {
      const roomDomain = extractEntityDomain(rId);
      if (roomDomain && roomDomain !== myDomain) {
        externalDomains.add(roomDomain);
      }
      if (room?.peers && typeof room.peers === 'object') {
        for (const uid of Object.keys(room.peers)) {
          const pDomain = extractEntityDomain(uid);
          if (pDomain && pDomain !== myDomain) {
            externalDomains.add(pDomain);
            externalPeers.push(uid);
          }
        }
      }
    }

    return {
      is_federated: externalDomains.size > 0,
      external_domains: Array.from(externalDomains),
      external_peers: externalPeers
    };
  }

  collectKnownPeers() {
    const map = new Map();
    const myDomain = this.getServerDomain().toLowerCase();
    for (const room of Object.values(this.rooms)) {
      if (room?.peers && typeof room.peers === 'object') {
        for (const [uid, name] of Object.entries(room.peers)) {
          if (uid && uid !== this.config.user_id && uid.startsWith('@') && !this.knownBots.some(b => uid.includes(b))) {
            if (!map.has(uid)) {
              const domain = extractEntityDomain(uid);
              map.set(uid, {
                user_id: uid,
                name: name || uid.split(':')[0].slice(1),
                is_external: Boolean(myDomain && domain && domain !== myDomain)
              });
            }
          }
        }
      }
    }
    return Array.from(map.values());
  }

  async login(homeserver, username, password) {
    const hs = normalizeHomeserver(homeserver);
    log('info', '正在向 Matrix 服务器请求登录鉴权', { homeserver: hs, username });

    const body = {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: username
      },
      user: username,
      password,
      initial_device_display_name: 'ZCode Matrix Bridge',
      device_id: 'ZCODE-MATRIX-BOT'
    };

    const res = await fetch(`${hs}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `登录失败 (HTTP ${res.status})`);
    }

    this.nextBatch = '';
    this.updateConfig({
      homeserver: hs,
      username,
      user_id: data.user_id,
      device_id: data.device_id || 'ZCODE-MATRIX-BOT',
      access_token: data.access_token,
      auto_connect: true
    });

    log('info', 'Matrix 登录成功，已签发设备凭证', { user_id: data.user_id });
    return {
      user_id: data.user_id,
      access_token: data.access_token,
      device_id: data.device_id
    };
  }

  async verifyToken(homeserver, accessToken) {
    const hs = normalizeHomeserver(homeserver);
    const res = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.user_id) {
      throw new Error(data.error || `Token 校验失败 (HTTP ${res.status})`);
    }
    this.nextBatch = '';
    this.updateConfig({
      homeserver: hs,
      user_id: data.user_id,
      device_id: data.device_id || '',
      access_token: accessToken,
      auto_connect: true
    });
    log('info', 'Access Token 校验通过', { user_id: data.user_id });
    return { user_id: data.user_id, device_id: data.device_id || '' };
  }

  async start() {
    if (this.syncing) {
      await this.stop(false);
    }
    if (!this.config.homeserver || !this.config.access_token) {
      throw new Error('尚未配置 Homeserver 或 Access Token');
    }

    if (!this.config.user_id) {
      await this.verifyToken(this.config.homeserver, this.config.access_token);
    }

    this.connected = true;
    this.syncing = true;
    this.syncState = 'connecting';
    this.lastError = '';
    this.connectedAt = Date.now();
    this.abortController = new AbortController();
    this.updateConfig({ auto_connect: true });

    log('info', '已启动 Matrix 实时同步引擎', {
      homeserver: this.config.homeserver,
      user_id: this.config.user_id
    });

    this.syncLoop().catch(err => {
      log('error', '同步引擎异常退出', { error: err.message });
      this.connected = false;
      this.syncing = false;
      this.syncState = 'error';
      this.lastError = err.message;
    });
  }

  async stop(persistAutoConnect = true) {
    log('info', '已暂停 Matrix 实时同步');
    this.connected = false;
    this.syncing = false;
    this.syncState = 'offline';
    if (persistAutoConnect) {
      this.updateConfig({ auto_connect: false });
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async logout() {
    await this.stop(true);
    this.nextBatch = '';
    this.updateConfig({
      access_token: '',
      user_id: '',
      device_id: '',
      auto_connect: false
    });
    log('info', '已退出当前 Matrix 账号并清除本地凭证');
  }

  async syncLoop() {
    let backoffMs = 2000;
    while (this.syncing) {
      const isInitialSync = !this.nextBatch;
      try {
        const hs = normalizeHomeserver(this.config.homeserver);
        const timeout = isInitialSync ? 0 : 25000;
        let syncUrl = `${hs}/_matrix/client/v3/sync?timeout=${timeout}`;
        if (this.nextBatch) {
          syncUrl += `&since=${encodeURIComponent(this.nextBatch)}`;
        }

        const res = await fetch(syncUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.config.access_token}` },
          signal: this.abortController?.signal
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            this.syncState = 'error';
            this.lastError = `凭证已失效 (${errMsg})，请重新登录`;
            this.connected = false;
            this.syncing = false;
            log('error', this.lastError);
            return;
          }
          throw new Error(`Sync HTTP ${res.status}: ${errMsg}`);
        }

        const data = await res.json();
        backoffMs = 2000;
        this.syncState = 'online';
        this.lastError = '';
        this.nextBatch = data.next_batch || this.nextBatch;

        await this.handleSyncResponse(data, isInitialSync);
      } catch (err) {
        if (!this.syncing || err.name === 'AbortError') break;
        this.syncState = 'error';
        this.lastError = err.message;
        log('warn', 'Matrix 同步连接波动，准备重试', { error: err.message, backoffMs });
        await new Promise(r => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30000);
      }
    }
  }

  async handleSyncResponse(data, isInitialSync) {
    // 0. 解析 m.direct 私聊映射
    const accountEvents = data.account_data?.events || [];
    for (const ev of accountEvents) {
      if (ev.type === 'm.direct' && ev.content && typeof ev.content === 'object') {
        for (const roomList of Object.values(ev.content)) {
          if (Array.isArray(roomList)) {
            for (const rId of roomList) this.directRoomIds.add(rId);
          }
        }
      }
    }

    const rooms = data.rooms || {};

    // 1. 按邀请准入策略处理房间邀请 (all | local_server | allowlist | none)
    if (rooms.invite) {
      for (const [roomId, inviteData] of Object.entries(rooms.invite)) {
        const invEvents = inviteData?.invite_state?.events || [];
        let inviter = '';
        for (const ev of invEvents) {
          if (ev.type === 'm.room.member') {
            if (ev.content?.is_direct) {
              this.directRoomIds.add(roomId);
            }
            if (ev.state_key === this.config.user_id && ev.content?.membership === 'invite' && ev.sender) {
              inviter = ev.sender;
            }
          }
        }
        if (!inviter && invEvents.length > 0) {
          inviter = invEvents[invEvents.length - 1]?.sender || '';
        }

        const inviteKey = `${roomId}:${inviter}:${this.config.invite_policy}`;
        if (this.processedInvites.has(inviteKey)) continue;
        this.processedInvites.add(inviteKey);
        setTimeout(() => this.processedInvites.delete(inviteKey), 20000);

        const invitePolicy = this.config.invite_policy || 'all';
        let shouldJoin = false;
        if (invitePolicy === 'all') {
          shouldJoin = true;
        } else if (invitePolicy === 'local_server') {
          shouldJoin = Boolean(inviter && (this.isAdmin(inviter) || this.isLocalServerUser(inviter)));
          if (!shouldJoin) {
            log('sec', '已按「仅本服务器」策略拒绝外服联邦邀请', { roomId, inviter: inviter || '未知' });
            await this.leaveRoom(roomId);
          }
        } else if (invitePolicy === 'allowlist') {
          shouldJoin = Boolean(inviter && (this.isAdmin(inviter) || this.isUserInList(inviter, this.config.invite_allowlist)));
          if (!shouldJoin) {
            log('sec', '已拒绝非白名单账号的房间邀请', { roomId, inviter: inviter || '未知' });
            await this.leaveRoom(roomId);
          }
        } else {
          // 'none' — 拒绝所有邀请
          log('sec', '已按「拒绝所有邀请」策略婉拒入群邀请', { roomId, inviter: inviter || '未知' });
          await this.leaveRoom(roomId);
        }

        if (shouldJoin) {
          await this.joinRoom(roomId, inviter);
          const isDirectInvite = invEvents.some(e => e.content?.is_direct);
          if (isDirectInvite || (!invEvents.some(e => e.type === 'm.room.name') && inviter)) {
            this.directRoomIds.add(roomId);
            if (inviter) await this.markDirect(inviter, roomId);
          }
        }
      }
    }

    // 2. 处理已加入房间
    if (rooms.join) {
      let roomsChanged = false;
      for (const [roomId, roomData] of Object.entries(rooms.join)) {
        if (!this.rooms[roomId]) {
          this.rooms[roomId] = {
            id: roomId,
            name: '',
            explicit_name: '',
            canonical_alias: '',
            peers: {},
            policy: 'default',
            workspace: '',
            model: '',
            effort: '',
            session_id: '',
            thread_sessions: {},
            is_dm: false,
            member_count: 0,
            last_seen: Date.now()
          };
          roomsChanged = true;
        }

        const room = this.rooms[roomId];
        if (!room.peers) room.peers = {};
        if (!room.thread_sessions) room.thread_sessions = {};

        const summary = roomData.summary || {};
        if (typeof summary['m.joined_member_count'] === 'number') {
          const total = summary['m.joined_member_count'] + (summary['m.invited_member_count'] || 0);
          if (total > 0) room.member_count = total;
        }
        if (Array.isArray(summary['m.heroes'])) {
          for (const heroId of summary['m.heroes']) {
            if (heroId !== this.config.user_id && !room.peers[heroId]) {
              room.peers[heroId] = heroId.split(':')[0].replace(/^@/, '');
            }
          }
        }

        const stateEvents = roomData.state?.events || [];
        const timelineEvents = roomData.timeline?.events || [];
        const allEvents = [...stateEvents, ...timelineEvents];

        for (const ev of allEvents) {
          if (ev.type === 'm.room.name' && ev.content?.name) {
            room.explicit_name = ev.content.name;
            roomsChanged = true;
          } else if (ev.type === 'm.room.canonical_alias' && ev.content?.alias) {
            room.canonical_alias = ev.content.alias;
            roomsChanged = true;
          } else if (ev.type === 'm.room.encryption') {
            room.encrypted = true;
            roomsChanged = true;
          } else if (ev.type === 'm.room.member') {
            const userId = ev.state_key;
            if (ev.content?.is_direct || ev.prev_content?.is_direct) {
              this.directRoomIds.add(roomId);
              const peer = (userId === this.config.user_id) ? (ev.sender || '') : userId;
              if (peer && peer !== this.config.user_id) {
                this.markDirect(peer, roomId);
              }
            }
            if (userId === this.config.user_id && ev.content?.displayname) {
              room.self_displayname = ev.content.displayname;
            } else if (userId && userId !== this.config.user_id) {
              if (ev.content?.membership === 'join' || ev.content?.membership === 'invite') {
                room.peers[userId] = ev.content.displayname || userId.split(':')[0].replace(/^@/, '');
              } else if (ev.content?.membership === 'leave' || ev.content?.membership === 'ban') {
                delete room.peers[userId];
              }
            }
          }
        }

        const peerNames = Object.values(room.peers).filter(Boolean);
        if (!room.member_count && peerNames.length > 0) {
          room.member_count = peerNames.length + 1;
        }

        const isDirectFlag = this.directRoomIds.has(roomId);
        const looksLikeDm = !room.explicit_name && !room.canonical_alias && (room.member_count > 0 && room.member_count <= 2) && peerNames.length === 1;
        room.is_dm = Boolean(isDirectFlag || looksLikeDm);
        if (room.is_dm && peerNames.length === 1) {
          const peerId = Object.keys(room.peers)[0];
          if (peerId && !this.directRoomIds.has(roomId)) {
            this.directRoomIds.add(roomId);
            this.markDirect(peerId, roomId);
          }
        }

        if (room.explicit_name) {
          room.name = room.explicit_name;
        } else if (room.canonical_alias) {
          room.name = room.canonical_alias;
        } else if (peerNames.length > 0) {
          room.name = room.is_dm ? peerNames[0] : peerNames.slice(0, 3).join('、');
        } else if (!room.name || room.name === roomId) {
          room.name = roomId.split(':')[0];
        }

        for (const ev of timelineEvents) {
          if (!ev?.event_id) continue;
          const alreadySeen = this.processedEvents.has(ev.event_id);
          this.processedEvents.add(ev.event_id);
          if (this.processedEvents.size > 2000) {
            const arr = Array.from(this.processedEvents);
            this.processedEvents = new Set(arr.slice(arr.length - 1000));
          }

          if (isInitialSync || alreadySeen) continue;
          if (ev.origin_server_ts && ev.origin_server_ts < this.connectedAt - 5000) continue;

          if (ev.type === 'm.room.message' && ev.content && ev.sender !== this.config.user_id) {
            room.last_seen = Date.now();
            roomsChanged = true;
            await this.handleIncomingMessage(roomId, ev);
          }
        }
      }

      if (roomsChanged || isInitialSync) {
        saveRooms(this.rooms);
      }
    }
  }

  async joinRoom(roomId, inviter = '') {
    try {
      const hs = normalizeHomeserver(this.config.homeserver);
      const res = await fetch(`${hs}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      if (res.ok) {
        log('info', '已接受邀请加入房间', { roomId, inviter: inviter || undefined });
      } else {
        log('warn', '自动加入房间失败', { roomId, status: res.status });
      }
    } catch (e) {
      log('error', '加入房间请求异常', { error: e.message, roomId });
    }
  }

  async leaveRoom(roomId) {
    try {
      const hs = normalizeHomeserver(this.config.homeserver);
      await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
    } catch (e) {
      log('warn', '拒绝房间邀请调用异常', { error: e.message, roomId });
    }
  }

  async markDirect(userId, roomId) {
    if (!userId || !roomId || !this.config.user_id || !this.config.access_token) return;
    try {
      const hs = normalizeHomeserver(this.config.homeserver);
      const url = `${hs}/_matrix/client/v3/user/${encodeURIComponent(this.config.user_id)}/account_data/m.direct`;
      let direct = {};
      try {
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${this.config.access_token}` }
        });
        if (res.ok) direct = await res.json();
      } catch (_) {}
      direct[userId] = direct[userId] || [];
      if (!direct[userId].includes(roomId)) {
        direct[userId].push(roomId);
        await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.config.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(direct)
        });
        log('info', '已同步私聊房间映射至 Matrix Account Data', { userId, roomId });
      }
    } catch (e) {
      log('warn', '同步 m.direct 账户数据失败', { error: e.message, roomId });
    }
  }

  async setTyping(roomId, typing = true) {
    try {
      const hs = normalizeHomeserver(this.config.homeserver);
      await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(this.config.user_id)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ typing, timeout: 30000 })
      });
    } catch (_) {}
  }

  async sendMessage(roomId, content, opts = {}) {
    const replyToEventId = typeof opts === 'string' ? opts : opts?.replyToEventId;
    const threadRootId = typeof opts === 'object' ? opts?.threadRootId : '';

    const hs = normalizeHomeserver(this.config.homeserver);
    const txnId = `agy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const safeContent = sanitizeOutboundText(content, this.config.redact_sensitive !== false);

    const body = {
      msgtype: 'm.text',
      body: safeContent
    };

    if (threadRootId) {
      body['m.relates_to'] = {
        rel_type: 'm.thread',
        event_id: threadRootId,
        is_falling_back: true,
        'm.in_reply_to': {
          event_id: replyToEventId || threadRootId
        }
      };
    } else if (replyToEventId) {
      body['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: replyToEventId
        }
      };
    }

    const res = await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text();
      log('error', '发送 Matrix 消息失败', { roomId, error: txt });
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (data?.event_id) {
      this.recordBotEventId(data.event_id);
    }
    return data;
  }

  async uploadMedia(buffer, filename, mimeType = 'application/octet-stream') {
    const hs = normalizeHomeserver(this.config.homeserver);
    const safeName = sanitizeFilename(filename);
    const cleanMime = (mimeType || 'application/octet-stream').toLowerCase();

    if (!Buffer.isBuffer(buffer)) {
      buffer = Buffer.from(buffer);
    }

    // 50MB 媒体文件大小限制
    const MAX_SIZE = 50 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error(`媒体文件大小超限 (${formatBytes(buffer.length)} > 50MB)`);
    }

    const uploadEndpoints = [
      `${hs}/_matrix/media/v3/upload?filename=${encodeURIComponent(safeName)}`,
      `${hs}/_matrix/client/v1/media/upload?filename=${encodeURIComponent(safeName)}`
    ];

    let lastError = null;
    for (const url of uploadEndpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.access_token}`,
            'Content-Type': cleanMime
          },
          body: buffer
        });
        if (res.ok) {
          const data = await res.json();
          if (data.content_uri) {
            log('info', '已成功上传 Matrix 媒体附件', {
              filename: safeName,
              size: formatBytes(buffer.length),
              mxc: data.content_uri
            });
            return { content_uri: data.content_uri, size: buffer.length, mimeType: cleanMime };
          }
        }
        const errTxt = await res.text().catch(() => '');
        lastError = new Error(`HTTP ${res.status}: ${errTxt}`);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Matrix 媒体上传失败');
  }

  async downloadAndSaveMedia(roomId, mxcUri, suggestedFilename = 'attachment', expectedMime = '') {
    const hs = normalizeHomeserver(this.config.homeserver);
    const match = String(mxcUri || '').match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`无效的 Matrix MXC URI: ${mxcUri}`);
    }
    const [, serverName, mediaId] = match;

    const downloadEndpoints = [
      `${hs}/_matrix/client/v1/media/download/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}`,
      `${hs}/_matrix/media/v3/download/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}`
    ];

    let res = null;
    let lastErr = null;
    for (const url of downloadEndpoints) {
      try {
        const candidateRes = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.config.access_token}` }
        });
        if (candidateRes.ok) {
          res = candidateRes;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!res || !res.ok) {
      throw new Error(`Matrix 媒体下载失败: ${lastErr?.message || (res ? `HTTP ${res.status}` : '无法连接')}`);
    }

    const contentLength = Number(res.headers.get('content-length') || 0);
    const MAX_SIZE = 50 * 1024 * 1024;
    if (contentLength > MAX_SIZE) {
      throw new Error(`附件大小超限 (${formatBytes(contentLength)} > 50MB)`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_SIZE) {
      throw new Error(`附件大小超限 (${formatBytes(buffer.length)} > 50MB)`);
    }

    const rawMime = res.headers.get('content-type') || expectedMime || '';
    const cleanMime = rawMime.split(';')[0].trim().toLowerCase() || 'application/octet-stream';

    let rawName = sanitizeFilename(suggestedFilename);
    if (!rawName.includes('.')) {
      const ext = getExtensionFromMime(cleanMime);
      if (ext) rawName += ext;
    }

    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const roomMediaDir = join(ATTACHMENTS_DIR, safeRoomId);
    if (!existsSync(roomMediaDir)) {
      mkdirSync(roomMediaDir, { recursive: true });
    }

    const safeFilename = `${Date.now()}_${rawName}`;
    const fullPath = join(roomMediaDir, safeFilename);
    writeFileSync(fullPath, buffer);

    const dimensions = getImageDimensions(buffer);

    return {
      fullPath,
      filename: safeFilename,
      originalName: rawName,
      size: buffer.length,
      mimeType: cleanMime,
      dimensions
    };
  }

  async sendMediaMessage(roomId, { mxcUri, filename, mimeType, size, dimensions }, opts = {}) {
    const hs = normalizeHomeserver(this.config.homeserver);
    const txnId = `agy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanMime = (mimeType || 'application/octet-stream').toLowerCase();

    let msgtype = 'm.file';
    if (cleanMime.startsWith('image/')) msgtype = 'm.image';
    else if (cleanMime.startsWith('audio/')) msgtype = 'm.audio';
    else if (cleanMime.startsWith('video/')) msgtype = 'm.video';

    const info = {
      mimetype: cleanMime,
      size: size || 0
    };
    if (dimensions?.width && dimensions?.height) {
      info.w = dimensions.width;
      info.h = dimensions.height;
    }

    const body = {
      msgtype,
      body: filename,
      url: mxcUri,
      info
    };

    const replyToEventId = typeof opts === 'string' ? opts : opts?.replyToEventId;
    const threadRootId = typeof opts === 'object' ? opts?.threadRootId : '';

    if (threadRootId) {
      body['m.relates_to'] = {
        rel_type: 'm.thread',
        event_id: threadRootId,
        is_falling_back: true,
        'm.in_reply_to': {
          event_id: replyToEventId || threadRootId
        }
      };
    } else if (replyToEventId) {
      body['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: replyToEventId
        }
      };
    }

    const res = await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.event_id) {
        this.recordBotEventId(data.event_id);
      }
      return data;
    } else {
      const txt = await res.text();
      log('error', '发送 Matrix 媒体消息失败', { roomId, filename, error: txt });
      throw new Error(`发送媒体消息失败: ${txt}`);
    }
  }

  isMentioned(ev, text, selfId, selfDisplayName = '') {
    if (!selfId) return false;
    const mentions = ev?.content?.['m.mentions']?.user_ids;
    if (Array.isArray(mentions) && mentions.includes(selfId)) return true;
    if (!text) return false;
    if (text.includes(selfId)) return true;
    const localPart = selfId.split(':')[0].replace(/^@/, '');
    if (localPart && (text.includes(`@${localPart}`) || text.includes(`${localPart}:`))) {
      return true;
    }
    if (selfDisplayName && (text.includes(`@${selfDisplayName}`) || text.startsWith(`${selfDisplayName}:`) || text.startsWith(`${selfDisplayName}：`))) {
      return true;
    }
    return false;
  }

  stripMention(text, selfId, selfDisplayName = '') {
    if (!selfId || !text) return text || '';
    let res = text.replaceAll(selfId, '');
    const localPart = selfId.split(':')[0].replace(/^@/, '');
    if (localPart) {
      res = res.replace(new RegExp(`@?${localPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:：,\\s]*`, 'gi'), '');
    }
    if (selfDisplayName) {
      res = res.replace(new RegExp(`^@?${selfDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:：,\\s]*`, 'i'), '');
    }
    return res.trim();
  }

  getEffectivePolicy(roomInfo) {
    if (!roomInfo || !roomInfo.policy || roomInfo.policy === 'default') {
      return roomInfo?.is_dm ? 'all' : (this.config.default_policy || 'mention');
    }
    return roomInfo.policy;
  }

  canAcceptSenderMessage(sender) {
    // 管理员始终放行，避免误锁死
    if (this.isAdmin(sender)) return { allowed: true };

    const msgPolicy = this.config.message_policy || 'all';
    if (msgPolicy === 'none') {
      return { allowed: false, reason: '已启用「拒绝所有消息」策略' };
    }
    if (msgPolicy === 'local_server') {
      if (!this.isLocalServerUser(sender)) {
        return { allowed: false, reason: '仅允许本服务器用户对话（拦截外服联邦账号）' };
      }
      if (this.isUserInList(sender, this.config.message_blocklist)) {
        return { allowed: false, reason: '发送者在消息黑名单内' };
      }
      return { allowed: true };
    }
    if (msgPolicy === 'allowlist') {
      if (this.isUserInList(sender, this.config.message_allowlist)) {
        return { allowed: true };
      }
      return { allowed: false, reason: '发送者不在消息白名单内' };
    }
    if (msgPolicy === 'blocklist') {
      if (this.isUserInList(sender, this.config.message_blocklist)) {
        return { allowed: false, reason: '发送者在消息黑名单内' };
      }
      return { allowed: true };
    }
    return { allowed: true };
  }

  checkRateAndPayloadGuard(sender, text) {
    if (this.isAdmin(sender) || this.config.rate_limit_enabled === false) {
      return { allowed: true };
    }
    if (text.length > 12000) {
      return { allowed: false, reason: `消息长度超限 (${text.length} > 12000 字符)` };
    }
    const now = Date.now();
    const recent = (this.senderRateMap.get(sender) || []).filter(ts => now - ts < 60000);
    if (recent.length >= 6) {
      this.senderRateMap.set(sender, recent);
      return { allowed: false, reason: '非管理员单分钟请求频次超限 (>6次/分)' };
    }
    recent.push(now);
    this.senderRateMap.set(sender, recent);
    return { allowed: true };
  }

  extractThreadRootId(ev) {
    const rel = ev?.content?.['m.relates_to'];
    if (rel?.rel_type === 'm.thread' && rel?.event_id) {
      return String(rel.event_id);
    }
    return '';
  }

  resetRoomSessions(room, threadRootId = '') {
    if (!room) return;
    if (!room.thread_sessions) room.thread_sessions = {};
    if (threadRootId) {
      delete room.thread_sessions[threadRootId];
    } else {
      room.session_id = '';
      room.thread_sessions = {};
    }
  }

  async handleIncomingMessage(roomId, ev) {
    const contentObj = ev.content || {};
    const msgtype = String(contentObj.msgtype || '');
    const hasMedia = Boolean(contentObj.url && contentObj.url.startsWith('mxc://'));
    const rawBody = String(contentObj.body || '').trim();
    if (!rawBody && !hasMedia) return;

    // 过滤 Matrix E2EE 解密等待中的占位事件，避免将错误提示词喂给大模型
    if (rawBody.startsWith('** Unable to decrypt')) {
      log('warn', '收到未解密事件 (等待 Element 设备协商并分发会话密钥)', {
        room: this.rooms[roomId]?.name || roomId,
        sender: ev.sender
      });
      return;
    }

    const sender = ev.sender || '';
    const roomInfo = this.rooms[roomId] || (this.rooms[roomId] = {
      id: roomId,
      policy: 'default',
      workspace: '',
      model: '',
      effort: '',
      session_id: '',
      thread_sessions: {},
      is_dm: false
    });

    const inReplyTo = contentObj['m.relates_to']?.['m.in_reply_to']?.event_id;
    const isReplyToBot = Boolean(inReplyTo && this.recentBotEventIds.has(inReplyTo));
    const mentioned = this.isMentioned(ev, rawBody, this.config.user_id, roomInfo.self_displayname) || isReplyToBot;
    const isSenderBot = this.knownBots.some(b => sender.includes(b));
    if (isSenderBot && !mentioned) {
      return;
    }

    const cleanText = mentioned ? this.stripMention(rawBody, this.config.user_id, roomInfo.self_displayname) : rawBody;
    const isSlashCommand = cleanText.startsWith('/');
    const senderIsAdmin = this.isAdmin(sender);
    const threadRootId = this.extractThreadRootId(ev);
    const replyOpts = { replyToEventId: ev.event_id, threadRootId };

    // 斜杠命令触发条件：1对1私聊无需 @ 直接触发；群聊必须显式 @ 本机器人（防止群内多个 Bot 同时响应指令冲突）
    const canTriggerCommand = Boolean(roomInfo.is_dm || mentioned);

    if (isSlashCommand && !canTriggerCommand) {
      return;
    }

    // 管理员特权指令通道（私聊直接触发，群聊 @本Bot 即可触发，不受房间静音或消息名单限制）
    if (isSlashCommand && canTriggerCommand && senderIsAdmin) {
      const handled = await this.handleCommand(roomId, ev, cleanText, true, replyOpts);
      if (handled) return;
    }

    // 检查接收消息准入策略（所有人 / 仅本服务器 / 白名单 / 黑名单 / 拒绝所有）
    const senderCheck = this.canAcceptSenderMessage(sender);
    if (!senderCheck.allowed) {
      log('sec', `已过滤消息 (${senderCheck.reason})`, {
        room: roomInfo.name || roomId,
        sender
      });
      return;
    }

    // 非管理员发送斜杠指令（私聊或群内显式 @本Bot 时返回只读状态或权限提示）
    if (isSlashCommand && canTriggerCommand) {
      const handled = await this.handleCommand(roomId, ev, cleanText, false, replyOpts);
      if (handled) return;
    }

    const effectivePolicy = this.getEffectivePolicy(roomInfo);
    if (effectivePolicy === 'mute') {
      return;
    }
    if (effectivePolicy === 'mention' && !mentioned) {
      return;
    }

    // 联邦共享房间防旁听保护：若群内存在外部联邦服务器成员（或房间属于外服），阻止代码与上下文外泄
    if (this.config.federated_room_guard !== false && !roomInfo.is_dm) {
      const fedInfo = this.getRoomFederationInfo(roomInfo, roomId);
      if (fedInfo.is_federated) {
        log('sec', '已拦截含外服成员群聊的对话触发，防止项目信息跨联邦同步泄露', {
          room: roomInfo.name || roomId,
          external_domains: fedInfo.external_domains
        });
        if (senderIsAdmin && mentioned) {
          await this.sendMessage(
            roomId,
            `🛡️ 安全拦截：检测到当前群聊包含外部联邦服务器 (${fedInfo.external_domains.join(', ')})，为防止本地代码与项目信息同步外泄，已自动阻止触发。\n如需在此群放行，可在侧栏「安全准入 → 联邦与隐私纵深防护」关闭「拦截含外服成员的群聊」。`,
            replyOpts
          );
        }
        return;
      }
    }

    // 仅管理员可触发工作区执行保护
    if (this.config.admin_only_workspace && !senderIsAdmin) {
      log('sec', '已按「仅管理员可调用工作区」策略拦截普通成员触发', {
        room: roomInfo.name || roomId,
        sender
      });
      return;
    }

    // 非管理员防洪限流与超长载荷保护
    const rateCheck = this.checkRateAndPayloadGuard(sender, cleanText);
    if (!rateCheck.allowed) {
      log('sec', `已触发防刷/载荷保护 (${rateCheck.reason})`, {
        room: roomInfo.name || roomId,
        sender
      });
      return;
    }

    // 处理并下载媒体附件
    let mediaAttachment = null;
    if (hasMedia) {
      try {
        const suggestedName = contentObj.body || (msgtype === 'm.image' ? 'image.png' : 'attachment');
        mediaAttachment = await this.downloadAndSaveMedia(roomId, contentObj.url, suggestedName, contentObj.info?.mimetype);
        log('info', '已接收并保存 Matrix 附件', {
          room: roomInfo.name || roomId,
          file: mediaAttachment.filename,
          size: formatBytes(mediaAttachment.size),
          mime: mediaAttachment.mimeType
        });
      } catch (dlErr) {
        log('error', '下载 Matrix 附件失败', { error: dlErr.message, mxc: contentObj.url });
      }
    }

    // 组装最终提示词（包含本地附件路径与多模态 read_file 指引）
    let promptForAgent = cleanText;
    if (mediaAttachment) {
      const fileDesc = [
        `[用户发送了附件/媒体文件]`,
        `• 文件名: ${mediaAttachment.originalName || mediaAttachment.filename}`,
        `• 本地绝对路径: ${mediaAttachment.fullPath}`,
        `• 文件类型: ${mediaAttachment.mimeType}`,
        `• 文件大小: ${formatBytes(mediaAttachment.size)}`,
        mediaAttachment.dimensions ? `• 图像尺寸: ${mediaAttachment.dimensions.width}x${mediaAttachment.dimensions.height}` : '',
        `• 指引: 你可以使用 read_file 读取该文件路径以分析其内容（支持图片、PDF、文本、代码、音视频或数据文件）。`
      ].filter(Boolean).join('\n');

      if (cleanText && cleanText !== (contentObj.body || '').trim()) {
        promptForAgent = `${fileDesc}\n\n[用户留言]:\n${cleanText}`;
      } else if (cleanText && cleanText === (contentObj.body || '').trim() && !['image.png', 'file', 'attachment'].includes(cleanText.toLowerCase())) {
        promptForAgent = `${fileDesc}\n\n[用户留言]:\n${cleanText}`;
      } else {
        promptForAgent = `${fileDesc}\n\n请查看并分析上述附件内容。`;
      }
    }

    log('msg', `[${roomInfo.name || roomId}${threadRootId ? '#Thread' : ''}] ${sender.split(':')[0]}: ${hasMedia ? `[附件: ${mediaAttachment ? mediaAttachment.originalName : '媒体文件'}] ` : ''}${cleanText.slice(0, 80)}`);
    await this.dispatchToZCode(roomId, ev, promptForAgent, threadRootId);
  }

  async requireAdminOrDeny(roomId, sender, isAdminUser, cmdName, replyOpts) {
    if (isAdminUser) return true;
    log('sec', `拦截非管理员执行管理命令 ${cmdName}`, { roomId, sender });
    if (!this.config.admins || this.config.admins.length === 0) {
      await this.sendMessage(
        roomId,
        `🔒 尚未配置管理员账号，无法执行 ${cmdName}。\n请在 ZCode 侧栏「Matrix Bot → 安全准入 → 管理员账号」中添加你的 Matrix ID：\n${sender}`,
        replyOpts
      );
    } else {
      await this.sendMessage(
        roomId,
        `⛔ 权限不足：仅管理员白名单账号可执行 ${cmdName} 命令。`,
        replyOpts
      );
    }
    return false;
  }

  async handleCommand(roomId, ev, cmdText, isAdminUser, replyOpts) {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const sender = ev.sender || '';
    const room = this.rooms[roomId] || (this.rooms[roomId] = {
      id: roomId,
      policy: 'default',
      workspace: '',
      model: '',
      effort: '',
      session_id: '',
      thread_sessions: {}
    });

    // 1. 工作区绑定命令 /workspace | /ws（支持多级目录浏览与绑定）
    if (cmd === '/workspace' || cmd === '/ws') {
      if (args.length === 0) {
        const curWs = room.workspace || (this.config.isolate_unbound_rooms !== false
          ? `未绑定（安全沙箱隔离中）`
          : `未单独绑定（默认目录: ${this.config.base_dir}）`);
        const effPol = this.getEffectivePolicy(room);
        await this.sendMessage(
          roomId,
          `📂 当前房间工作区:\n${curWs}\n触发规则: ${effPol}\n\n管理员命令 (支持多级子目录):\n• /workspace list [子路径] — 浏览默认目录或任意多级子目录\n• /workspace bind <多级相对路径或绝对路径> — 绑定目录\n• /workspace unbind — 解除绑定`,
          replyOpts
        );
        return true;
      }

      if (!(await this.requireAdminOrDeny(roomId, sender, isAdminUser, '/workspace', replyOpts))) {
        return true;
      }

      const sub = args[0].toLowerCase();
      if ((sub === 'bind' || sub === 'route') && args[1]) {
        const rawTarget = args.slice(1).join(' ').trim();
        const targetPath = resolveUserPath(rawTarget, this.config.base_dir);
        if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
          await this.sendMessage(roomId, `⚠️ 目录不存在: ${targetPath}\n可发送 /workspace list [子目录] 浏览可选的多级目录。`, replyOpts);
          return true;
        }
        if (room.workspace !== targetPath) {
          this.resetRoomSessions(room);
        }
        room.workspace = targetPath;
        saveRooms(this.rooms);
        log('info', '管理员通过指令绑定了房间目录', { room: room.name || roomId, sender, workspace: targetPath });
        await this.sendMessage(roomId, `✅ 已将当前房间绑定至工作目录:\n${targetPath}`, replyOpts);
        return true;
      }

      if (sub === 'unbind' || sub === 'clear') {
        room.workspace = '';
        this.resetRoomSessions(room);
        saveRooms(this.rooms);
        log('info', '管理员解除了房间目录绑定', { room: room.name || roomId, sender });
        await this.sendMessage(roomId, `✅ 已解除当前房间的工作目录绑定。`, replyOpts);
        return true;
      }

      if (sub === 'list' || sub === 'ls') {
        const subTarget = args.slice(1).join(' ').trim();
        const browsed = browseDirectory(subTarget, this.config.base_dir);
        const visibleDirs = browsed.dirs.filter(d => !d.is_system).slice(0, 35);
        const projLines = visibleDirs.length
          ? visibleDirs.map(d => {
            const relOrName = browsed.is_within_base && browsed.rel_current !== '.'
              ? `${browsed.rel_current}/${d.name}`
              : d.name;
            const tags = [
              d.is_repo ? 'Git' : '',
              d.sub_count > 0 ? `${d.sub_count}个子目录` : ''
            ].filter(Boolean).join(', ');
            return `• ${relOrName}${tags ? ` (${tags})` : ''}`;
          }).join('\n')
          : '（该目录下暂无子目录）';
        await this.sendMessage(
          roomId,
          `📁 目录浏览: ${browsed.current_path}\n${projLines}\n\n💡 多级目录用法:\n• 继续向下浏览: /workspace list <子目录路径>\n• 绑定任意层级: /workspace bind <相对路径或绝对路径>`,
          replyOpts
        );
        return true;
      }

      // 简写支持：/workspace <多级相对路径或绝对路径> 直接视为 bind
      const shorthand = args.join(' ').trim();
      const candidatePath = resolveUserPath(shorthand, this.config.base_dir);
      if (existsSync(candidatePath) && statSync(candidatePath).isDirectory()) {
        if (room.workspace !== candidatePath) {
          this.resetRoomSessions(room);
        }
        room.workspace = candidatePath;
        saveRooms(this.rooms);
        log('info', '管理员通过快捷指令绑定了房间目录', { room: room.name || roomId, sender, workspace: candidatePath });
        await this.sendMessage(roomId, `✅ 已将当前房间绑定至工作目录:\n${candidatePath}`, replyOpts);
        return true;
      }
    }

    // 2. 模型切换命令 /model
    if (cmd === '/model') {
      const models = await fetchAvailableModels(this.config.zcode_cmd);
      if (args.length === 0 || args[0].toLowerCase() === 'list') {
        const curRoomModel = room.model || '(跟随全局默认)';
        const curGlobalModel = this.config.default_model || '(CLI 默认)';
        const listStr = models.map((m, idx) => `${idx + 1}. ${m.id} — ${m.label}`).join('\n');
        await this.sendMessage(
          roomId,
          `🧠 当前房间模型: ${curRoomModel}\n全局默认模型: ${curGlobalModel}\n\n可选模型:\n${listStr}\n\n管理员用法:\n• /model <序号或模型ID> — 设置本房间模型\n• /model global <序号或模型ID> — 设置全局默认模型\n• /model default — 恢复跟随全局默认`,
          replyOpts
        );
        return true;
      }

      if (!(await this.requireAdminOrDeny(roomId, sender, isAdminUser, '/model', replyOpts))) {
        return true;
      }

      const isGlobal = args[0].toLowerCase() === 'global' && args[1];
      const rawChoice = (isGlobal ? args[1] : args[0]).trim().toLowerCase();

      if (rawChoice === 'default' || rawChoice === 'reset') {
        if (isGlobal) {
          this.updateConfig({ default_model: '' });
          await this.sendMessage(roomId, `✅ 全局默认模型已恢复为 ZCode CLI 默认。`, replyOpts);
        } else {
          room.model = '';
          saveRooms(this.rooms);
          await this.sendMessage(roomId, `✅ 当前房间已恢复跟随全局默认模型 (${this.config.default_model || 'CLI 默认'})。`, replyOpts);
        }
        return true;
      }

      let resolvedModel = '';
      const numIdx = Number(rawChoice);
      if (Number.isInteger(numIdx) && numIdx >= 1 && numIdx <= models.length) {
        resolvedModel = models[numIdx - 1].id;
      } else {
        const exact = models.find(m => m.id.toLowerCase() === rawChoice);
        const fuzzy = models.find(m => m.id.toLowerCase().includes(rawChoice) || m.label.toLowerCase().includes(rawChoice));
        resolvedModel = exact ? exact.id : (fuzzy ? fuzzy.id : rawChoice);
      }

      if (isGlobal) {
        this.updateConfig({ default_model: resolvedModel });
        log('info', '管理员修改了全局默认模型', { sender, model: resolvedModel });
        await this.sendMessage(roomId, `✅ 全局默认模型已切换为: ${resolvedModel}`, replyOpts);
      } else {
        room.model = resolvedModel;
        saveRooms(this.rooms);
        log('info', '管理员修改了房间模型', { room: room.name || roomId, sender, model: resolvedModel });
        await this.sendMessage(roomId, `✅ 当前房间模型已切换为: ${resolvedModel}`, replyOpts);
      }
      return true;
    }

    // 3. 思考深度命令 /effort | /thinking | /reasoning
    if (cmd === '/effort' || cmd === '/thinking' || cmd === '/reasoning' || cmd === '/think') {
      if (args.length === 0) {
        const curRoomEffort = room.effort || '(跟随全局默认)';
        const curGlobalEffort = this.config.default_effort || '(模型默认)';
        await this.sendMessage(
          roomId,
          `💡 当前房间思考深度: ${curRoomEffort}\n全局默认思考深度: ${curGlobalEffort}\n\n可选档位: low | medium | high | xhigh | max | default\n管理员用法:\n• /effort <档位> — 设置本房间思考深度\n• /effort global <档位> — 设置全局默认思考深度`,
          replyOpts
        );
        return true;
      }

      if (!(await this.requireAdminOrDeny(roomId, sender, isAdminUser, cmd, replyOpts))) {
        return true;
      }

      const isGlobal = args[0].toLowerCase() === 'global' && args[1];
      const level = (isGlobal ? args[1] : args[0]).trim().toLowerCase();

      if (level === 'default' || level === 'reset') {
        if (isGlobal) {
          this.updateConfig({ default_effort: '' });
          await this.sendMessage(roomId, `✅ 全局默认思考深度已恢复默认。`, replyOpts);
        } else {
          room.effort = '';
          saveRooms(this.rooms);
          await this.sendMessage(roomId, `✅ 当前房间思考深度已恢复跟随全局默认 (${this.config.default_effort || '模型默认'})。`, replyOpts);
        }
        return true;
      }

      if (!VALID_EFFORTS.includes(level)) {
        await this.sendMessage(roomId, `⚠️ 无效的思考深度档位 "${level}"。\n可选值: low | medium | high | xhigh | max | default`, replyOpts);
        return true;
      }

      if (isGlobal) {
        this.updateConfig({ default_effort: level });
        log('info', '管理员修改了全局思考深度', { sender, effort: level });
        await this.sendMessage(roomId, `✅ 全局默认思考深度已设置为: ${level}`, replyOpts);
      } else {
        room.effort = level;
        saveRooms(this.rooms);
        log('info', '管理员修改了房间思考深度', { room: room.name || roomId, sender, effort: level });
        await this.sendMessage(roomId, `✅ 当前房间思考深度已设置为: ${level}`, replyOpts);
      }
      return true;
    }

    // 4. 房间回复策略命令 /policy
    if (cmd === '/policy') {
      if (args.length === 0) {
        const curPol = room.policy || 'default';
        const effPol = this.getEffectivePolicy(room);
        await this.sendMessage(
          roomId,
          `🛡️ 当前房间策略: ${curPol} (实际生效: ${effPol})\n\n管理员用法:\n• /policy mention — 仅 @ 提及时回复\n• /policy all — 回复所有消息\n• /policy mute — 静音模式\n• /policy default — 恢复默认策略`,
          replyOpts
        );
        return true;
      }

      if (!(await this.requireAdminOrDeny(roomId, sender, isAdminUser, '/policy', replyOpts))) {
        return true;
      }

      const newPol = args[0].toLowerCase();
      if (['mention', 'all', 'mute', 'default'].includes(newPol)) {
        room.policy = newPol;
        saveRooms(this.rooms);
        log('info', '管理员更新了房间回复策略', { room: room.name || roomId, sender, policy: newPol });
        await this.sendMessage(roomId, `✅ 当前房间回复策略已切换为: ${newPol}`, replyOpts);
        return true;
      }
    }

    // 5. 重置会话命令 /new | /reset
    if (cmd === '/new' || cmd === '/reset') {
      if (this.config.admins.length > 0 && !isAdminUser && !room.is_dm) {
        await this.sendMessage(roomId, `⛔ 群聊中仅管理员可执行 /new 重置共享上下文（你可以在客户端开启新 Thread 开启独立支线话题）。`, replyOpts);
        return true;
      }
      const resetAll = args[0]?.toLowerCase() === 'all';
      const targetThread = resetAll ? '' : (replyOpts?.threadRootId || '');
      this.resetRoomSessions(room, targetThread);
      saveRooms(this.rooms);
      log('info', '已重置对话上下文', { room: room.name || roomId, thread: targetThread || 'main' });
      await this.sendMessage(
        roomId,
        targetThread
          ? `✅ 已重置当前 Thread 线程的独立上下文。`
          : `✅ 已重置当前房间主对话上下文，下一条消息将开启新会话。`,
        replyOpts
      );
      return true;
    }

    // 6. 状态查看 /status
    if (cmd === '/status') {
      const effPol = this.getEffectivePolicy(room);
      const effModel = room.model || this.config.default_model || 'CLI 默认';
      const effEffort = room.effort || this.config.default_effort || '模型默认';
      const curWs = room.workspace || (this.config.isolate_unbound_rooms !== false
        ? '安全沙箱隔离目录 (未绑定具体项目)'
        : `${this.config.base_dir} (默认)`);
      const fedInfo = this.getRoomFederationInfo(room, roomId);
      const activeSid = replyOpts?.threadRootId
        ? room.thread_sessions?.[replyOpts.threadRootId]
        : room.session_id;
      await this.sendMessage(
        roomId,
        `📊 当前房间运行状态\n` +
        `• 工作目录: ${curWs}\n` +
        `• 触发策略: ${effPol}\n` +
        `• 使用模型: ${effModel}\n` +
        `• 思考深度: ${effEffort}\n` +
        `• 联邦状态: ${fedInfo.is_federated ? `⚠️ 含外服 (${fedInfo.external_domains.join(', ')})` : '本服房间'}\n` +
        `• 邀请/消息准入: ${this.config.invite_policy} / ${this.config.message_policy}\n` +
        `• 会话上下文: ${activeSid ? activeSid.slice(0, 8) + '...' : '待新建'}${replyOpts?.threadRootId ? ' (Thread 独立会话)' : ''}\n` +
        `• 你的权限: ${isAdminUser ? '管理员' : '普通成员'}`,
        replyOpts
      );
      return true;
    }

    // 7. 发送文件或媒体 /sendfile | /upload
    if (cmd === '/sendfile' || cmd === '/upload') {
      if (args.length === 0) {
        await this.sendMessage(
          roomId,
          `📤 发送文件/媒体用法:\n/sendfile <文件路径>\n支持绝对路径或相对于当前房间工作目录的相对路径。`,
          replyOpts
        );
        return true;
      }

      if (!(await this.requireAdminOrDeny(roomId, sender, isAdminUser, cmd, replyOpts))) {
        return true;
      }

      const rawTarget = args.join(' ').trim();
      const baseDir = room.workspace || this.config.base_dir;
      const targetPath = resolveUserPath(rawTarget, baseDir);

      if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
        await this.sendMessage(roomId, `⚠️ 文件不存在或不是有效文件: ${targetPath}`, replyOpts);
        return true;
      }

      const fileStat = statSync(targetPath);
      if (fileStat.size > 50 * 1024 * 1024) {
        await this.sendMessage(roomId, `⚠️ 文件过大 (${formatBytes(fileStat.size)} > 50MB)，无法发送。`, replyOpts);
        return true;
      }

      try {
        const fileBuf = readFileSync(targetPath);
        const fileName = basename(targetPath);
        const mimeType = detectMimeType(fileName);
        const dimensions = getImageDimensions(fileBuf);
        const uploadRes = await this.uploadMedia(fileBuf, fileName, mimeType);
        await this.sendMediaMessage(roomId, {
          mxcUri: uploadRes.content_uri,
          filename: fileName,
          mimeType,
          size: fileBuf.length,
          dimensions
        }, replyOpts);
        log('info', '管理员已成功通过指令发送文件', { room: room.name || roomId, file: fileName, size: formatBytes(fileBuf.length) });
        return true;
      } catch (sendErr) {
        log('error', '发送文件失败', { error: sendErr.message, file: targetPath });
        await this.sendMessage(roomId, `❌ 发送文件失败: ${sendErr.message}`, replyOpts);
        return true;
      }
    }

    // 8. 帮助 /help
    if (cmd === '/help') {
      const help =
        `🤖 ZCode Matrix Bot 指令指南\n` +
        `（私聊直接发送指令；群聊请先 @本机器人 再接指令，避免与群内其他 Bot 冲突）\n\n` +
        `• /status — 查看当前房间目录、模型、安全策略与会话状态\n` +
        `• /workspace [list [子目录] | bind <多级路径> | unbind] — 浏览或绑定多级工作目录 (管理员)\n` +
        `• /model [list | <序号/模型ID> | default] — 查看或切换模型 (管理员)\n` +
        `• /effort [low|medium|high|xhigh|max|default] — 设置思考深度 (管理员，别名 /thinking)\n` +
        `• /policy [mention|all|mute|default] — 切换房间触发策略 (管理员)\n` +
        `• /sendfile <路径> — 上传并发送本地文件/图片至当前房间 (管理员，别名 /upload)\n` +
        `• /new — 开启全新对话上下文（支持 Matrix Thread 自动隔离子会话）`;
      await this.sendMessage(roomId, help, replyOpts);
      return true;
    }

    return false;
  }

  dispatchToZCode(roomId, ev, cleanText, threadRootId = '') {
    if (!cleanText.trim()) return Promise.resolve();

    const queueKey = threadRootId ? `${roomId}#${threadRootId}` : roomId;
    const prev = this.roomQueues.get(queueKey) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this.runZCodeTurn(roomId, ev, cleanText, threadRootId));
    this.roomQueues.set(queueKey, next);
    return next;
  }

  async runZCodeTurn(roomId, ev, cleanText, threadRootId = '') {
    const room = this.rooms[roomId] || (this.rooms[roomId] = {
      id: roomId,
      policy: 'default',
      workspace: '',
      model: '',
      effort: '',
      session_id: '',
      thread_sessions: {}
    });
    if (!room.thread_sessions) room.thread_sessions = {};

    const hasBoundWs = Boolean(room.workspace && existsSync(room.workspace));
    const useSandbox = !hasBoundWs && (this.config.isolate_unbound_rooms !== false);
    const rawWorkDir = hasBoundWs
      ? room.workspace
      : (useSandbox ? SANDBOX_DIR : this.config.base_dir);
    const cwd = rawWorkDir && existsSync(rawWorkDir) ? rawWorkDir : SANDBOX_DIR;
    const agyBin = this.config.zcode_cmd || '/Users/xiangyu/bin/zcode';

    // 群聊共享会话时自动注入发言人身份署名；未绑定目录沙箱模式注入安全隔离边界
    const sender = ev.sender || '';
    const prefixLines = [];
    if (useSandbox) {
      prefixLines.push('[系统安全边界: 当前房间尚未绑定具体开发项目目录，正在受限隔离沙箱中运行。请仅进行通用对话答疑或在当前沙箱内创建临时文件，严禁读取、搜索或修改宿主机主目录及其他目录的文件。]');
    }
    if (!room.is_dm && sender) {
      const displayName = room.peers?.[sender] || sender.split(':')[0].replace(/^@/, '');
      prefixLines.push(`[群聊发言人: ${displayName} (${sender})]`);
    }
    const finalPrompt = prefixLines.length > 0
      ? `${prefixLines.join('\n')}\n${cleanText}`
      : cleanText;

    const currentSessionId = threadRootId
      ? (room.thread_sessions[threadRootId] || '')
      : (room.session_id || '');
    const effectiveModel = room.model || this.config.default_model || '';
    const effectiveEffort = room.effort || this.config.default_effort || '';
    const replyOpts = { replyToEventId: ev.event_id, threadRootId };

    log('info', '正在调用 ZCode 处理消息', {
      room: room.name || roomId,
      workDir: useSandbox ? 'sandbox(隔离)' : (basename(cwd) || cwd),
      model: effectiveModel || 'default',
      effort: effectiveEffort || 'default',
      thread: Boolean(threadRootId),
      resuming: Boolean(currentSessionId)
    });

    await this.setTyping(roomId, true);
    const typingTimer = setInterval(() => {
      this.setTyping(roomId, true);
    }, 20000);

    try {
      let result = await this.invokeZCodeOnce(agyBin, cwd, finalPrompt, {
        sessionId: currentSessionId,
        model: effectiveModel,
        effort: effectiveEffort
      });

      if (result.code !== 0 && currentSessionId) {
        log('warn', '恢复旧会话失败，自动开启新会话重试', { session_id: currentSessionId });
        this.resetRoomSessions(room, threadRootId);
        saveRooms(this.rooms);
        result = await this.invokeZCodeOnce(agyBin, cwd, finalPrompt, {
          sessionId: '',
          model: effectiveModel,
          effort: effectiveEffort
        });
      }

      if (result.code === 0) {
        let replyText = '';
        let newSessionId = '';
        const trimmedOut = result.stdout.trim();
        if (trimmedOut) {
          const parsed = parseZcodeJsonOutput(trimmedOut);
          if (parsed) {
            newSessionId = String(parsed.sessionId || parsed.session_id || parsed.conversation_id || '');
            replyText = String(parsed.response ?? parsed.result ?? '').trim();
          } else {
            replyText = trimmedOut;
          }
        }

        if (newSessionId) {
          if (threadRootId) {
            room.thread_sessions[threadRootId] = newSessionId;
          } else {
            room.session_id = newSessionId;
          }
          saveRooms(this.rooms);
        }

        if (replyText) {
          // 扫描回复中的本地图片与文件标记
          const outboundFiles = [];
          const seenPaths = new Set();

          // 1. Markdown 图像语法: ![alt](path)
          const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
          let m;
          while ((m = mdImgRegex.exec(replyText)) !== null) {
            const rawPath = m[2].trim().replace(/^file:\/\//, '');
            const candidate = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
            if (existsSync(candidate) && statSync(candidate).isFile() && !seenPaths.has(candidate)) {
              seenPaths.add(candidate);
              outboundFiles.push({ raw: m[0], path: candidate, type: 'image' });
            }
          }

          // 2. 文件标签语法: <send-file path="..." /> 或 [SEND_FILE: ...]
          const tagRegex = /<send-file\s+path=["']([^"']+)["']\s*\/?>/gi;
          while ((m = tagRegex.exec(replyText)) !== null) {
            const rawPath = m[1].trim().replace(/^file:\/\//, '');
            const candidate = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
            if (existsSync(candidate) && statSync(candidate).isFile() && !seenPaths.has(candidate)) {
              seenPaths.add(candidate);
              outboundFiles.push({ raw: m[0], path: candidate, type: 'file' });
            }
          }

          const directiveRegex = /\[SEND_FILE:\s*([^\s\]]+)\]/gi;
          while ((m = directiveRegex.exec(replyText)) !== null) {
            const rawPath = m[1].trim().replace(/^file:\/\//, '');
            const candidate = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
            if (existsSync(candidate) && statSync(candidate).isFile() && !seenPaths.has(candidate)) {
              seenPaths.add(candidate);
              outboundFiles.push({ raw: m[0], path: candidate, type: 'file' });
            }
          }

          // 依次上传并发送检测到的媒体文件
          for (const item of outboundFiles) {
            try {
              const fileStat = statSync(item.path);
              if (fileStat.size <= 50 * 1024 * 1024) {
                const fileBuf = readFileSync(item.path);
                const fileName = basename(item.path);
                const mimeType = detectMimeType(fileName);
                const dimensions = getImageDimensions(fileBuf);
                const uploadRes = await this.uploadMedia(fileBuf, fileName, mimeType);
                await this.sendMediaMessage(roomId, {
                  mxcUri: uploadRes.content_uri,
                  filename: fileName,
                  mimeType,
                  size: fileBuf.length,
                  dimensions
                }, replyOpts);
                log('info', '已成功向 Matrix 发送输出媒体文件', {
                  room: room.name || roomId,
                  file: fileName,
                  size: formatBytes(fileBuf.length)
                });
              } else {
                log('warn', '跳过超大输出文件', { path: item.path, size: formatBytes(fileStat.size) });
              }
            } catch (mediaErr) {
              log('error', '发送输出媒体文件失败', { error: mediaErr.message, path: item.path });
            }
          }

          // 清理回复文本中的专用指令标签（保留正文与说明）
          let cleanedReply = replyText
            .replace(/<send-file\s+path=["'][^"']+["']\s*\/?>/gi, '')
            .replace(/\[SEND_FILE:\s*[^\s\]]+\]/gi, '')
            .trim();

          if (cleanedReply) {
            log('msg', `已回复 [${room.name || roomId}${threadRootId ? '#Thread' : ''}] (${cleanedReply.length} 字)`);
            await this.sendMessage(roomId, cleanedReply, replyOpts);
          }
        } else {
          await this.sendMessage(roomId, '（已完成执行，无文本输出）', replyOpts);
        }
      } else {
        const errMsg = result.stderr.trim() || result.stdout.trim() || `进程退出码 ${result.code}`;
        log('error', 'ZCode CLI 执行异常', { code: result.code, error: errMsg.slice(0, 200) });
        await this.sendMessage(roomId, `⚠️ ZCode 执行异常 (Exit ${result.code}):\n${errMsg.slice(0, 500)}`, replyOpts);
      }
    } catch (err) {
      log('error', '无法启动 agy 命令', { error: err.message, agyBin });
      await this.sendMessage(roomId, `❌ 无法启动 ZCode CLI (${agyBin}): ${err.message}`, replyOpts);
    } finally {
      clearInterval(typingTimer);
      await this.setTyping(roomId, false);
    }
  }

  invokeZCodeOnce(zcodeBin, cwd, prompt, { sessionId = '', model = '', effort = '', timeoutMs = 30 * 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
      const args = ['-p', prompt, '--json'];
      if (sessionId) {
        args.push('--resume', sessionId);
      }
      if (model) {
        args.push('--model', model);
      }

      const cleanEnv = { ...process.env, LANG: 'en_US.UTF-8', NO_COLOR: '1' };

      const child = spawn(zcodeBin, args, {
        cwd,
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d.toString('utf-8'); });
      child.stderr.on('data', d => { stderr += d.toString('utf-8'); });

      const timer = setTimeout(() => {
        log('warn', 'ZCode 执行超时，强制终止进程', { sessionId: sessionId || '新会话', timeoutMs });
        try { child.kill('SIGKILL'); } catch (_) {}
      }, timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }
}

function parseZcodeJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch (_) {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch (_) {}
  }
  return null;
}

const engine = new MatrixBotEngine();

async function handleApiRequest(pathname, method, body) {
  if (method === 'GET' && pathname === '/api/status') {
    return {
      connected: engine.connected,
      sync_state: engine.syncState,
      last_error: engine.lastError,
      configured: Boolean(engine.config.homeserver && engine.config.access_token),
      homeserver: engine.config.homeserver,
      server_domain: engine.getServerDomain(),
      user_id: engine.config.user_id,
      device_id: engine.config.device_id || '',
      default_policy: engine.config.default_policy || 'mention',
      default_model: engine.config.default_model || '',
      default_effort: engine.config.default_effort || '',
      admin_count: (engine.config.admins || []).length,
      invite_policy: engine.config.invite_policy || 'all',
      message_policy: engine.config.message_policy || 'all',
      room_count: Object.keys(engine.rooms).length
    };
  }

  if (method === 'GET' && pathname === '/api/config') {
    return {
      homeserver: engine.config.homeserver,
      server_domain: engine.getServerDomain(),
      username: engine.config.username,
      user_id: engine.config.user_id,
      device_id: engine.config.device_id || '',
      has_token: Boolean(engine.config.access_token),
      access_token: engine.config.access_token,
      base_dir: engine.config.base_dir,
      default_policy: engine.config.default_policy || 'mention',
      default_model: engine.config.default_model || '',
      default_effort: engine.config.default_effort || '',
      invite_policy: engine.config.invite_policy || 'all',
      invite_allowlist: engine.config.invite_allowlist || [],
      admins: engine.config.admins || [],
      message_policy: engine.config.message_policy || 'all',
      message_allowlist: engine.config.message_allowlist || [],
      message_blocklist: engine.config.message_blocklist || [],
      federated_room_guard: engine.config.federated_room_guard !== false,
      isolate_unbound_rooms: engine.config.isolate_unbound_rooms !== false,
      admin_only_workspace: Boolean(engine.config.admin_only_workspace),
      redact_sensitive: engine.config.redact_sensitive !== false,
      rate_limit_enabled: engine.config.rate_limit_enabled !== false,
      known_peers: engine.collectKnownPeers(),
      zcode_cmd: engine.config.zcode_cmd
    };
  }

  if (method === 'POST' && pathname === '/api/config') {
    engine.updateConfig(body);
    return {
      success: true,
      admins: engine.config.admins,
      invite_policy: engine.config.invite_policy,
      invite_allowlist: engine.config.invite_allowlist,
      message_policy: engine.config.message_policy,
      message_allowlist: engine.config.message_allowlist,
      message_blocklist: engine.config.message_blocklist,
      federated_room_guard: engine.config.federated_room_guard !== false,
      isolate_unbound_rooms: engine.config.isolate_unbound_rooms !== false,
      admin_only_workspace: Boolean(engine.config.admin_only_workspace),
      redact_sensitive: engine.config.redact_sensitive !== false,
      rate_limit_enabled: engine.config.rate_limit_enabled !== false
    };
  }

  if (method === 'GET' && pathname === '/api/models') {
    const models = await fetchAvailableModels(engine.config.zcode_cmd);
    return { models, efforts: VALID_EFFORTS };
  }

  if (method === 'GET' && pathname === '/api/fs/browse') {
    return browseDirectory(body?.path || '', engine.config.base_dir);
  }

  if (method === 'GET' && pathname === '/api/fs/search') {
    return searchDirectories(engine.config.base_dir, body?.q || '');
  }

  if (method === 'POST' && pathname === '/api/login') {
    const { homeserver, username, password, auto_start = true } = body;
    if (!homeserver || !username || !password) {
      throw new Error('请完整填写服务器地址、用户名和密码');
    }
    const res = await engine.login(homeserver, username, password);
    if (auto_start) {
      await engine.start();
    }
    return { success: true, connected: engine.connected, ...res };
  }

  if (method === 'POST' && pathname === '/api/verify-token') {
    const { homeserver, access_token, auto_start = true } = body;
    if (!homeserver || !access_token) {
      throw new Error('请填写服务器地址和 Access Token');
    }
    const res = await engine.verifyToken(homeserver, access_token);
    if (auto_start) {
      await engine.start();
    }
    return { success: true, connected: engine.connected, ...res };
  }

  if (method === 'POST' && pathname === '/api/logout') {
    await engine.logout();
    return { success: true };
  }

  if (method === 'POST' && pathname === '/api/connect') {
    await engine.start();
    return { success: true, connected: engine.connected };
  }

  if (method === 'POST' && pathname === '/api/disconnect') {
    await engine.stop(true);
    return { success: true, connected: engine.connected };
  }

  if (method === 'GET' && pathname === '/api/rooms') {
    const list = Object.values(engine.rooms).map(r => {
      const fed = engine.getRoomFederationInfo(r, r.id);
      return {
        ...r,
        effective_policy: engine.getEffectivePolicy(r),
        is_federated: fed.is_federated,
        external_domains: fed.external_domains
      };
    });
    list.sort((a, b) => {
      if (Boolean(a.workspace) !== Boolean(b.workspace)) return a.workspace ? -1 : 1;
      return (b.last_seen || 0) - (a.last_seen || 0);
    });
    return { rooms: list };
  }

  if (method === 'POST' && pathname === '/api/rooms/update') {
    const { id, policy, workspace, model, effort, reset_session } = body;
    if (!id || !engine.rooms[id]) {
      throw new Error('未找到该房间: ' + id);
    }
    const room = engine.rooms[id];
    if (policy) {
      room.policy = policy;
    }
    if (typeof model === 'string') {
      room.model = model.trim();
    }
    if (typeof effort === 'string') {
      const ef = effort.trim().toLowerCase();
      if (ef && !VALID_EFFORTS.includes(ef)) {
        throw new Error(`无效的思考深度: ${ef}`);
      }
      room.effort = ef;
    }
    if (typeof workspace === 'string') {
      const trimmed = workspace.trim();
      const resolvedWs = trimmed ? resolveUserPath(trimmed, engine.config.base_dir) : '';
      if (resolvedWs && (!existsSync(resolvedWs) || !statSync(resolvedWs).isDirectory())) {
        throw new Error(`目录不存在: ${resolvedWs}`);
      }
      if (room.workspace !== resolvedWs) {
        engine.resetRoomSessions(room);
      }
      room.workspace = resolvedWs;
    }
    if (reset_session) {
      engine.resetRoomSessions(room);
    }
    saveRooms(engine.rooms);
    log('info', '已更新房间配置', {
      room: room.name || id,
      policy: room.policy,
      model: room.model || '(默认)',
      effort: room.effort || '(默认)',
      workspace: room.workspace || '(未绑定/沙箱)'
    });
    const fed = engine.getRoomFederationInfo(room, room.id);
    return {
      success: true,
      room: {
        ...room,
        effective_policy: engine.getEffectivePolicy(room),
        is_federated: fed.is_federated,
        external_domains: fed.external_domains
      }
    };
  }

  if (method === 'GET' && pathname === '/api/projects') {
    const projects = scanProjects(engine.config.base_dir);
    return { base_dir: engine.config.base_dir, projects };
  }

  if (method === 'GET' && pathname === '/api/logs') {
    return { logs };
  }

  if (method === 'POST' && pathname === '/api/logs/clear') {
    logs.length = 0;
    return { success: true };
  }

  throw new Error(`未知接口: ${method} ${pathname}`);
}

const CONSOLE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'console');

async function bootstrap() {
  if (engine.config.homeserver && engine.config.access_token && engine.config.auto_connect !== false) {
    engine.start().catch(err => {
      log('warn', '启动时自动连接 Matrix 失败', { error: err.message });
    });
  }

  const port = Number(process.env.MATRIX_BRIDGE_PORT || process.env.PORT || 47613);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const noCache = { 'Cache-Control': 'no-store' };

    const staticFiles = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/index.html': ['index.html', 'text/html; charset=utf-8'],
      '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      '/app.js': ['app.js', 'application/javascript; charset=utf-8']
    };
    const staticHit = staticFiles[url.pathname];
    if (req.method === 'GET' && staticHit) {
      try {
        res.writeHead(200, { 'Content-Type': staticHit[1], ...noCache });
        res.end(readFileSync(join(CONSOLE_DIR, staticHit[0]), 'utf-8'));
      } catch (_) {
        res.writeHead(404, noCache);
        res.end('Console file missing');
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', ...noCache });
      res.end('/* standalone: direct HTTP mode */');
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      // CORS：控制台面板运行在 ZCode 桌面 webview（非本源），API 仅绑定 127.0.0.1，放行跨源安全
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sidecar-Token');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = {};
      for (const [k, v] of url.searchParams.entries()) {
        if (k.toLowerCase() !== 'token') body[k] = v;
      }
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        if (raw) {
          try { Object.assign(body, JSON.parse(raw)); } catch (_) {}
        }
      }
      try {
        const result = await handleApiRequest(url.pathname, req.method, body);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log('error', `管理端口 ${port} 已被占用，跳过控制台启动（Matrix 同步不受影响）`, { error: err.message });
    } else {
      log('error', '管理 HTTP 服务异常', { error: err.message });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    log('info', `管理控制台已启动: http://127.0.0.1:${port}/`);
  });

  // 优雅退出（launchctl 停止时收到 SIGTERM）
  process.on('SIGTERM', async () => {
    log('info', '收到 SIGTERM，正在优雅退出');
    await engine.stop(false).catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

bootstrap().catch(err => {
  log('error', '启动失败', { error: err.message });
  process.exit(1);
});
