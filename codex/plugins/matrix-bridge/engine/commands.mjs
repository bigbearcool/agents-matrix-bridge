import { stat, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

// Commands are applied inside the room queue, so they cannot race a running turn.
export async function handleCommand({body, room, config, sender, settings = {}, thread = '', isDirect = false}) {
  let text = String(body).trim();
  if (text.startsWith(config.user_id)) text = text.slice(config.user_id.length).trimStart();
  const match = text.match(/^\/(new|reset|list|switch|current|dir|workspace|ws|policy|model|effort|thinking|reasoning|status|help)(?=\s|$)([^\n]*)/i);
  if (!match) return null;
  const cmd=match[1].toLowerCase(), arg=match[2].trim();
  const admin=(config.admins || []).includes(sender);
  if (cmd==='help') return '指令：/status、/workspace [list|bind|unbind]、/policy、/model、/effort、/sendfile、/new、/reset。';
  if (cmd==='status') return `工作目录：${room.workspace || config.cwd}\n策略：${room.policy || 'default'}\n模型：${room.model || settings.default_model || '默认'}\n思考深度：${room.effort || settings.default_effort || '默认'}`;
  if (cmd==='policy') {
    if (!arg) return `当前策略：${room.policy || 'default'}`;
    if (!admin) return '只有管理员可以修改房间策略。';
    if (!['mention','all','mute','default'].includes(arg)) return '可选策略：mention、all、mute、default。';
    room.policy=arg; return `房间策略：${arg}`;
  }
  if (['model','effort','thinking','reasoning'].includes(cmd)) {
    const key=cmd==='model'?'model':'effort';
    if (!arg || arg==='list') return `当前${key}：${room[key] || settings[`default_${key}`] || '默认'}`;
    if (!admin) return `只有管理员可以修改 ${key}。`;
    const parts=arg.split(/\s+/); const global=parts[0]==='global'; const value=global ? parts[1] : parts[0];
    if (!value) return '请指定设置值。';
    if (key==='effort' && !['minimal','low','medium','high','xhigh','max','default'].includes(value)) return '无效的思考深度。';
    if (global) settings[`default_${key}`]=value==='default'?'':value; else room[key]=value==='default'?'':value;
    return `${global?'全局':'房间'} ${key}：${value}`;
  }
  if ((cmd==='reset'||cmd==='new') && !admin && !isDirect) return '群聊中只有管理员可以重置会话。';
  if (thread && (cmd==='reset'||cmd==='new')) { if (!admin && !isDirect) return '只有管理员可以重置线程。'; if (room.thread_sessions) delete room.thread_sessions[thread]; return '当前线程会话已重置。'; }
  if (cmd==='workspace'||cmd==='ws') {
    const [sub,...rest]=arg.split(/\s+/); const path=rest.join(' ');
    if (!sub) return `工作目录：${room.workspace || config.cwd}`;
    if (!admin) return '只有管理员可以管理工作区。';
    if (sub==='list') { const target=resolve(config.cwd,path || '.'); try { const entries=await readdir(target,{withFileTypes:true}); return `目录：${target}\n`+entries.filter(e=>e.isDirectory() && !e.name.startsWith('.')).slice(0,35).map(e=>`• ${e.name}`).join('\n'); } catch { return '目录不存在或不可访问。'; } }
    if (sub==='unbind') { room.workspace=''; room.thread_id=''; room.thread_sessions={}; room.sessions={}; room.active_session=''; return '已解除工作区绑定。'; }
    const raw=sub==='bind' ? path : arg; if (!raw) return '请指定目录。'; const target=isAbsolute(raw)?resolve(raw):resolve(config.cwd,raw);
    try { if (!(await stat(target)).isDirectory()) return '目标不是目录。'; } catch { return '目录不存在或不可访问。'; }
    if (room.workspace!==target) {room.workspace=target;room.thread_id='';room.thread_sessions={};room.sessions={};room.active_session='';} return `工作目录：${target}`;
  }
  if (cmd==='reset') { if (!admin && !isDirect) return '只有管理员可以重置会话。'; room.thread_id='';room.thread_sessions={};room.sessions={};room.active_session='';return '当前房间会话已重置。'; }
  room.sessions ||= {};
  if (!room.active_session) {
    room.active_session='s1'; room.sessions.s1 ||= {thread_id:room.thread_id || '', workspace:room.workspace || config.cwd,thread_sessions:room.thread_sessions || {}};
  }
  const active=room.sessions[room.active_session];
  if (cmd==='new') {
    const number=Math.max(0,...Object.keys(room.sessions).map(s=>Number(/^s(\d+)$/.exec(s)?.[1] || 0)))+1;
    room.active_session=`s${number}`; room.sessions[room.active_session]={thread_id:'',workspace:room.workspace || config.cwd,name:arg,thread_sessions:{}}; room.thread_id=''; room.thread_sessions=room.sessions[room.active_session].thread_sessions;
    return `已创建会话 ${room.active_session}${arg ? `（${arg}）` : ''}。`;
  }
  if (cmd==='current') return `当前会话：${room.active_session}\n工作目录：${active.workspace || config.cwd}`;
  if (cmd==='list') return Object.entries(room.sessions).map(([id,s])=>`${id===room.active_session ? '* ' : '  '}${id}${s.name ? ` ${s.name}` : ''}`).join('\n');
  if (cmd==='switch') {
    if (!room.sessions[arg]) return '会话不存在，请先使用 /list 查看。';
    room.active_session=arg; room.workspace=room.sessions[arg].workspace || config.cwd; room.thread_id=room.sessions[arg].thread_id || ''; room.thread_sessions=room.sessions[arg].thread_sessions || {}; return `已切换到会话 ${arg}。`;
  }
  if (!(config.admins || []).includes(sender)) return '只有管理员可以使用 /dir。';
  if (!arg) return `当前工作目录：${room.workspace || config.cwd}`;
  const target=arg==='reset' ? config.cwd : isAbsolute(arg) ? resolve(arg) : resolve(config.cwd,arg);
  try { if (!(await stat(target)).isDirectory()) return '目标不是目录。'; } catch { return '目录不存在或不可访问。'; }
  if (target !== (room.workspace || config.cwd)) { room.workspace=target; room.thread_id=''; room.thread_sessions={}; active.workspace=target; active.thread_id=''; active.thread_sessions=room.thread_sessions; }
  return `工作目录：${target}`;
}
