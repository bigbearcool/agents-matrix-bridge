import { stat, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { normalizeModelCatalog } from './adapter.mjs';

/**
 * Chat command dispatcher.
 *
 * Commands are applied inside the room queue, so they cannot race a running
 * turn. The module is stateless: every mutation is applied to the supplied
 * room/settings objects, which the bridge persists.
 *
 * Slash commands from ordinary prose are never treated as commands because the
 * parser anchors at the start of the (mention-stripped) message.
 */

const COMMAND_PATTERN = /^\/(new|reset|list|switch|current|dir|workspace|ws|policy|model|models|effort|thinking|reasoning|status|help)(?=\s|$)([^\n]*)/i;
const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export async function readModelCatalog(adapter) {
  if (!adapter || typeof adapter.listAvailableModels !== 'function') {
    return { models: [], efforts: [] };
  }
  try {
    return normalizeModelCatalog(await adapter.listAvailableModels());
  } catch {
    return { models: [], efforts: [] };
  }
}

function formatCatalog(catalog, key) {
  if (key === 'effort') {
    const efforts = catalog.efforts.length ? catalog.efforts : EFFORTS;
    return ['可选思考深度：', ...efforts.map((effort) => `• ${effort}`)].join('\n');
  }
  if (!catalog.models.length) return '当前 Agent 未提供可选模型列表。';
  return ['可选模型：', ...catalog.models.map((model) => {
    const suffix = model.description ? `：${model.description}` : model.name && model.name !== model.id ? `（${model.name}）` : '';
    return `• ${model.id}${suffix}`;
  })].join('\n');
}

function stripMention(text, userId) {
  if (userId && text.startsWith(userId)) return text.slice(userId.length).trimStart();
  return text;
}

/** Parse a command without executing it (exported for bridge/thread routing). */
export function parseCommand(body, config = {}) {
  const text = stripMention(String(body ?? '').trim(), config.user_id);
  const match = text.match(COMMAND_PATTERN);
  if (!match) return null;
  return { name: match[1].toLowerCase(), arg: match[2].trim(), text };
}

export async function handleCommand({
  body,
  room,
  config,
  sender,
  settings = {},
  thread = '',
  isDirect = false,
  adapter = null,
  modelCatalog = null
}) {
  const parsed = parseCommand(body, config);
  if (!parsed) return null;

  const { name: cmd, arg } = parsed;
  const admin = (config.admins || []).includes(sender);
  const adapterName = adapter?.name || 'generic';

  if (cmd === 'help') {
    return [
      `当前 Agent：${adapterName}`,
      '指令：/status、/workspace [list|bind|unbind]、/policy、/model [list]、/effort [list]、/sendfile、/new、/reset。'
    ].join('\n');
  }

  if (cmd === 'status') {
    return [
      `Agent：${adapterName}`,
      `工作目录：${room.workspace || config.cwd}`,
      `策略：${room.policy || 'default'}`,
      `模型：${room.model || settings.default_model || '默认'}`,
      `思考深度：${room.effort || settings.default_effort || '默认'}`,
      `上下文恢复：${thread ? (room.thread_sessions?.[thread] || '新线程') : (room.thread_id || '新会话')}`
    ].join('\n');
  }

  if (cmd === 'policy') {
    if (!arg) return `当前策略：${room.policy || 'default'}`;
    if (!admin) return '只有管理员可以修改房间策略。';
    if (!['mention', 'all', 'mute', 'default'].includes(arg)) return '可选策略：mention、all、mute、default。';
    room.policy = arg;
    return `房间策略：${arg}`;
  }

  if (['model', 'models', 'effort', 'thinking', 'reasoning'].includes(cmd)) {
    const key = cmd === 'model' || cmd === 'models' ? 'model' : 'effort';
    const catalog = modelCatalog ? normalizeModelCatalog(modelCatalog) : await readModelCatalog(adapter);
    if (!arg || arg === 'list') {
      const current = room[key] || settings[`default_${key}`] || '默认';
      return [`当前${key}：${current}`, formatCatalog(catalog, key)].join('\n');
    }
    if (!admin) return `只有管理员可以修改 ${key}。`;
    const parts = arg.split(/\s+/);
    const global = parts[0] === 'global';
    const value = global ? parts[1] : parts[0];
    if (!value) return '请指定设置值。';
    if (key === 'effort') {
      const allowed = new Set([...EFFORTS, ...catalog.efforts, 'default']);
      if (!allowed.has(value)) return `无效的思考深度。${formatCatalog(catalog, 'effort')}`;
    }
    if (global) settings[`default_${key}`] = value === 'default' ? '' : value;
    else room[key] = value === 'default' ? '' : value;
    return `${global ? '全局' : '房间'} ${key}：${value}`;
  }

  if ((cmd === 'reset' || cmd === 'new') && !admin && !isDirect) return '群聊中只有管理员可以重置会话。';
  if (thread && (cmd === 'reset' || cmd === 'new')) {
    if (!admin && !isDirect) return '只有管理员可以重置线程。';
    if (room.thread_sessions) delete room.thread_sessions[thread];
    return '当前线程会话已重置。';
  }

  if (cmd === 'workspace' || cmd === 'ws') {
    const [sub, ...rest] = arg.split(/\s+/);
    const path = rest.join(' ');
    if (!sub) return `工作目录：${room.workspace || config.cwd}`;
    if (!admin) return '只有管理员可以管理工作区。';
    if (sub === 'list') {
      const target = resolve(config.cwd, path || '.');
      try {
        const entries = await readdir(target, { withFileTypes: true });
        return `目录：${target}\n` + entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .slice(0, 35)
          .map((entry) => `• ${entry.name}`)
          .join('\n');
      } catch {
        return '目录不存在或不可访问。';
      }
    }
    if (sub === 'unbind') {
      room.workspace = '';
      room.thread_id = '';
      room.thread_sessions = {};
      room.sessions = {};
      room.active_session = '';
      return '已解除工作区绑定。';
    }
    const raw = sub === 'bind' ? path : arg;
    if (!raw) return '请指定目录。';
    const target = isAbsolute(raw) ? resolve(raw) : resolve(config.cwd, raw);
    try {
      if (!(await stat(target)).isDirectory()) return '目标不是目录。';
    } catch {
      return '目录不存在或不可访问。';
    }
    if (room.workspace !== target) {
      room.workspace = target;
      room.thread_id = '';
      room.thread_sessions = {};
      room.sessions = {};
      room.active_session = '';
    }
    return `工作目录：${target}`;
  }

  if (cmd === 'reset') {
    if (!admin && !isDirect) return '只有管理员可以重置会话。';
    room.thread_id = '';
    room.thread_sessions = {};
    room.sessions = {};
    room.active_session = '';
    return '当前房间会话已重置。';
  }

  room.sessions ||= {};
  if (!room.active_session) {
    room.active_session = 's1';
    room.sessions.s1 ||= {
      thread_id: room.thread_id || '',
      workspace: room.workspace || config.cwd,
      thread_sessions: room.thread_sessions || {}
    };
  }
  const active = room.sessions[room.active_session];

  if (cmd === 'new') {
    const number = Math.max(0, ...Object.keys(room.sessions).map((session) => Number(/^s(\d+)$/.exec(session)?.[1] || 0))) + 1;
    room.active_session = `s${number}`;
    room.sessions[room.active_session] = { thread_id: '', workspace: room.workspace || config.cwd, name: arg, thread_sessions: {} };
    room.thread_id = '';
    room.thread_sessions = room.sessions[room.active_session].thread_sessions;
    return `已创建会话 ${room.active_session}${arg ? `（${arg}）` : ''}。`;
  }
  if (cmd === 'current') return `当前会话：${room.active_session}\n工作目录：${active.workspace || config.cwd}`;
  if (cmd === 'list') {
    return Object.entries(room.sessions)
      .map(([id, session]) => `${id === room.active_session ? '* ' : '  '}${id}${session.name ? ` ${session.name}` : ''}`)
      .join('\n');
  }
  if (cmd === 'switch') {
    if (!room.sessions[arg]) return '会话不存在，请先使用 /list 查看。';
    room.active_session = arg;
    room.workspace = room.sessions[arg].workspace || config.cwd;
    room.thread_id = room.sessions[arg].thread_id || '';
    room.thread_sessions = room.sessions[arg].thread_sessions || {};
    return `已切换到会话 ${arg}。`;
  }

  if (!(config.admins || []).includes(sender)) return '只有管理员可以使用 /dir。';
  if (!arg) return `当前工作目录：${room.workspace || config.cwd}`;
  const target = arg === 'reset' ? config.cwd : isAbsolute(arg) ? resolve(arg) : resolve(config.cwd, arg);
  try {
    if (!(await stat(target)).isDirectory()) return '目标不是目录。';
  } catch {
    return '目录不存在或不可访问。';
  }
  if (target !== (room.workspace || config.cwd)) {
    room.workspace = target;
    room.thread_id = '';
    room.thread_sessions = {};
    active.workspace = target;
    active.thread_id = '';
    active.thread_sessions = room.thread_sessions;
  }
  return `工作目录：${target}`;
}
