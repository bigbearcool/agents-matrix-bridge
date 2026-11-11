import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { dirname, join, extname, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { CodexClient } from './codex-client.mjs';
import { handleCommand } from './commands.mjs';
import { domain, messageAllowed, inviteAllowed, redact } from './security.mjs';
import { sendFile, outputFiles } from './media.mjs';

export class Bridge {
  constructor(config, token, { fetchImpl = fetch, clientFactory = () => new CodexClient(config.codex_cmd || 'codex', Object.fromEntries(Object.entries({ ...process.env, ...(config.codex_home ? { CODEX_HOME: config.codex_home } : {}) }).filter(([key]) => key !== 'MATRIX_ACCESS_TOKEN'))) } = {}) {
    this.config = config; this.token = token; this.fetch = fetchImpl; this.clientFactory = clientFactory; this.state = { rooms: {}, inbox: [] }; this.running = false;
    this.statePath = config.state_path || join(homedir(), '.codex', 'matrix-bridge', 'state.json'); this.saves = Promise.resolve(); this.queues = new Map(); this.approvals = new Map(); this.blockedRooms = new Set(); this.syncAbort = new AbortController(); this.paused = false; this.syncState = 'offline'; this.lastSyncTime = ''; this.activity = []; this.senderRates = new Map();
    this.directRoomIds = new Set(config.direct_rooms || []);
  }
  log(kind, message) { this.activity.push({time:new Date().toISOString(),kind,message}); if(this.activity.length>300) this.activity.shift(); }
  async load() { try { this.state = JSON.parse(await readFile(this.statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } this.state.rooms ||= {}; this.state.inbox ||= []; this.state.settings ||= {}; }
  async save() { const snapshot = JSON.stringify(this.state); this.saves = this.saves.catch(() => {}).then(async () => { await mkdir(dirname(this.statePath), { recursive: true, mode: 0o700 }); const tmp = this.statePath + '.' + randomUUID(); await writeFile(tmp, snapshot, { mode: 0o600 }); await rename(tmp, this.statePath); }); await this.saves; }
  async api(path, options = {}) { const res = await this.fetch(this.config.homeserver.replace(/\/$/, '') + path, { redirect:'error', ...options, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...options.headers } }); if (!res.ok) throw new Error(`Matrix HTTP ${res.status}`); return res.json(); }
  async send(roomId, text, eventId, threadRoot) { const relates = threadRoot ? {rel_type:'m.thread',event_id:threadRoot,is_falling_back:true,'m.in_reply_to':{event_id:eventId}} : eventId ? {'m.in_reply_to':{event_id:eventId}} : null; const body = {msgtype:'m.text',body:redact(text,this.config.redact_sensitive === true,this.token),...(relates ? {'m.relates_to':relates} : {})}; const result=await this.api(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${randomUUID()}`, { method:'PUT', body:JSON.stringify(body) }); await this.rememberSent(roomId,result.event_id); return result; }
  async rememberSent(roomId, eventId) { if(!eventId) return; const room=this.state.rooms[roomId] ||= {}; room.bot_events ||= []; room.bot_events.push(eventId); if(room.bot_events.length>500) room.bot_events.splice(0,room.bot_events.length-500); await this.save(); }
  authorized(sender) { return this.config.allowed_senders.includes('*') || this.config.allowed_senders.includes(sender); }
  async directed(roomId, ev, ignoreGlobal = false) { const body = ev.content?.body || ''; const bot = this.config.user_id; const at = body.indexOf(bot); const replyId=ev.content?.['m.relates_to']?.['m.in_reply_to']?.event_id; const after = at < 0 ? '' : body[at + bot.length] || ''; if ((this.state.rooms[roomId]?.bot_events || []).includes(replyId) || this.config.direct_rooms.includes(roomId) || (ev.content?.['m.mentions']?.user_ids || []).includes(bot) || (at >= 0 && !/[\p{L}\p{N}._=\/:-]/u.test(after)) || (!ignoreGlobal && this.config.group_reply_all === true)) return true; return this.isDirect(roomId,ev); }
  async refreshDirectRooms() {
    try {
      const bot = this.config.user_id;
      const direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`);
      for (const rids of Object.values(direct || {})) {
        if (Array.isArray(rids)) {
          for (const rid of rids) {
            this.directRoomIds.add(rid);
            if (this.state.rooms[rid]) this.state.rooms[rid].is_direct = true;
          }
        }
      }
    } catch (_) {}
  }
  async markDirect(userId, roomId) {
    if (!userId || !roomId) return;
    this.directRoomIds.add(roomId);
    if (this.state.rooms[roomId]) this.state.rooms[roomId].is_direct = true;
    try {
      const bot = this.config.user_id;
      let direct = {};
      try { direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`); } catch {}
      direct[userId] ||= [];
      if (!direct[userId].includes(roomId)) {
        direct[userId].push(roomId);
        await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`, { method: 'PUT', body: JSON.stringify(direct) });
      }
    } catch (_) {}
  }
  async isDirect(roomId, ev) {
    const bot=this.config.user_id;
    if (this.directRoomIds.has(roomId) || this.config.direct_rooms.includes(roomId) || this.state.rooms[roomId]?.is_direct) return true;
    try {
      const direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`);
      for (const rids of Object.values(direct || {})) {
        if (Array.isArray(rids)) {
          for (const rid of rids) this.directRoomIds.add(rid);
        }
      }
      if (this.directRoomIds.has(roomId)) {
        if (this.state.rooms[roomId]) this.state.rooms[roomId].is_direct = true;
        return true;
      }
      if (ev?.sender) {
        if (!(direct[ev.sender] || []).includes(roomId)) return false;
        const members = await this.api(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`);
        const ids = Object.keys(members.joined || {});
        const ok = ids.length === 2 && ids.includes(bot) && ids.includes(ev.sender);
        if (ok) {
          this.directRoomIds.add(roomId);
          if (this.state.rooms[roomId]) this.state.rooms[roomId].is_direct = true;
        }
        return ok;
      }
    } catch { return false; }
    return false;
  }
  async processEvent(roomId, ev) {
    if (ev.type !== 'm.room.message' || ev.sender === this.config.user_id || !['m.text','m.image','m.file','m.audio','m.video'].includes(ev.content?.msgtype) || !ev.event_id || !this.authorized(ev.sender)) return;
    const body = String(ev.content.body || '').trim() || (ev.content.msgtype !== 'm.text' && ev.content.url ? '附件' : '');
    if (body.startsWith('** Unable to decrypt')) { this.log('warn',`房间 ${roomId} 消息尚未解密`); return; }
    const input = body.match(/^\/answer\s+([a-f0-9]{12})\s+([\s\S]+)$/i);
    if (input) { const pending = this.approvals.get(input[1]); if (pending && pending.type === 'input' && pending.roomId === roomId && (pending.sender === ev.sender || (this.config.admins || []).includes(ev.sender))) { pending.answers[pending.questions[pending.index].id] = {answers:[input[2]]}; pending.index++; if (pending.index === pending.questions.length) { this.approvals.delete(input[1]); clearTimeout(pending.timer); pending.client.respondInput(pending.requestId,pending.answers); } else await this.sendQuestion(input[1], pending); } return; }
    const approval = body.match(/^\/(approve|deny)\s+([a-f0-9]{12})\s*$/i);
    if (approval) { const pending = this.approvals.get(approval[2]); if (pending && pending.type !== 'input' && pending.roomId === roomId && (this.config.admins || []).includes(ev.sender)) { this.approvals.delete(approval[2]); clearTimeout(pending.timer); pending.client.respondApproval(pending.requestId, approval[1].toLowerCase() === 'approve' ? 'accept' : 'decline', pending.request); } return; }
    if (!body || (this.state.rooms[roomId]?.encrypted && this.config.matrix_transport !== 'pantalaimon')) return;
    if (!messageAllowed(this.config, ev.sender)) return;
    const room = this.state.rooms[roomId] ||= {};
    const addressed = await this.directed(roomId, ev, true);
    const stripped = body.startsWith(this.config.user_id) ? body.slice(this.config.user_id.length).trimStart() : body;
    const isCommand = stripped.startsWith('/');
    const defaultPolicy=this.config.default_policy || (this.config.group_reply_all ? 'all' : 'mention');
    const directDefault = !room.policy || room.policy === 'default' ? await this.isDirect(roomId,ev) : false;
    const policy = room.policy && room.policy !== 'default' ? room.policy : (directDefault ? 'all' : defaultPolicy);
    if (isCommand && !addressed) return;
    if (policy === 'mute' && !(isCommand && addressed && (this.config.admins || []).includes(ev.sender))) return;
    if (policy !== 'all' && !addressed) return;
    const admin=(this.config.admins || []).includes(ev.sender);
    if (!isCommand && this.config.admin_only_workspace && !admin) return;
    if (!isCommand && this.config.rate_limit_enabled && !admin) { const now=Date.now(), recent=(this.senderRates.get(ev.sender)||[]).filter(t=>now-t<60000); if(body.length>12000 || recent.length>=6) return; recent.push(now); this.senderRates.set(ev.sender,recent); }
    if (!isCommand && this.config.federated_room_guard && !this.config.direct_rooms.includes(roomId)) { try { const data=await this.api(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`); const ids=Object.keys(data.joined || {}); if(!ids.length || (domain(roomId) && domain(roomId)!==domain(this.config.user_id)) || ids.some(id=>domain(id)!==domain(this.config.user_id))) return; } catch { return; } }
    room.processed_events ||= [];
    if (room.processed_events.includes(ev.event_id)) return;
    room.processed_events.push(ev.event_id);
    const needsDirect = /^\/(new|reset)(?:\s|$)/i.test(stripped);
    this.log('message',`收到房间消息 ${roomId}`);
    const item = { id: ev.event_id, roomId, ev, isDirect: needsDirect ? await this.isDirect(roomId,ev) : false, status: 'queued' }; this.state.inbox.push(item); await this.save(); this.enqueue(item);
  }
  enqueue(item) { const prev = this.queues.get(item.roomId) || Promise.resolve(); const next = prev.catch(() => {}).then(() => this.execute(item)).catch(e => console.error('message processing failed:', e.message)); this.queues.set(item.roomId, next); next.finally(() => { if (this.queues.get(item.roomId) === next) this.queues.delete(item.roomId); }); }
  async execute(item) {
    if (this.blockedRooms.has(item.roomId)) return;
    item.status = 'started'; await this.save();
    const {roomId, ev} = item; const room = this.state.rooms[roomId]; const rel = ev.content['m.relates_to']; const thread = rel?.rel_type === 'm.thread' ? rel.event_id : ''; room.thread_sessions ||= {};
    let client;
    try {
      let body=String(ev.content.body || '').trim(); if (body.startsWith(this.config.user_id)) body=body.slice(this.config.user_id.length).trimStart();
      const uploadCommand=/^\/(sendfile|upload)(?:\s+([\s\S]+))?$/i.exec(body);
      if (uploadCommand) { if (!(this.config.admins||[]).includes(ev.sender)) { item.status='replying'; await this.save(); await this.send(roomId,'只有管理员可以发送文件。',ev.event_id,thread); } else if (!uploadCommand[2]) { item.status='replying'; await this.save(); await this.send(roomId,'用法：/sendfile <路径>',ev.event_id,thread); } else { const raw=uploadCommand[2].trim(); const path=isAbsolute(raw)?raw:resolve(room.workspace||this.config.cwd,raw); item.status='replying'; await this.save(); await sendFile(this,roomId,path,ev.event_id,thread); } item.status='delivered'; await this.save(); return; }
      let commandResult = ev.content.msgtype !== 'm.text' ? null : await handleCommand({body:ev.content.body,room,config:this.config,sender:ev.sender,settings:this.state.settings,thread,isDirect:item.isDirect});
      if (/^\/model(?:\s+list)?\s*$/i.test(body)) { const c=this.clientFactory(); try {await c.initialize();const result=await c.request('model/list',{});commandResult += '\n可选模型：\n'+(result.data||[]).map(m=>`• ${m.id}`).join('\n');} finally {c.close();} }
      if (commandResult !== null) { await this.save(); item.status='replying'; await this.save(); await this.send(roomId,commandResult,ev.event_id,thread); item.status='delivered'; await this.save(); return; }
      client = this.clientFactory();
      await client.initialize();
      let cwd=room.workspace || this.config.cwd;
      if (!room.workspace && this.config.isolate_unbound_rooms) {cwd=join(dirname(this.statePath),'sandbox');await mkdir(cwd,{recursive:true,mode:0o700});}
      let text = `[Matrix 发言人: ${room.peers?.[ev.sender] || ev.sender} (${ev.sender})]\n${ev.content.body}`; let attachments = [];
      if (ev.content.msgtype !== 'm.text') { const file = await this.downloadAttachment(ev.content); text += `\n附件名称：${ev.content.body || 'attachment'}\n媒体类型：${ev.content.info?.mimetype || '未知'}\n本地路径：${file}`; if (ev.content.msgtype === 'm.image') attachments.push({type:'localImage',path:file}); else if (ev.content.msgtype === 'm.audio') attachments.push({type:'localAudio',path:file}); else text += `\n附件本地路径：${file}`; }
      const result = await client.turn({ attachments, model:room.model || this.state.settings.default_model || '', effort:room.effort || this.state.settings.default_effort || '', threadId: thread ? room.thread_sessions[thread] : room.thread_id, cwd, text, onThread: async id => { if (thread) { room.thread_sessions[thread] = id; if (room.active_session && room.sessions?.[room.active_session]) room.sessions[room.active_session].thread_sessions = room.thread_sessions; } else { room.thread_id = id; if (room.active_session && room.sessions?.[room.active_session]) room.sessions[room.active_session].thread_id = id; } await this.save(); }, onApproval: request => { const f = request.method === 'item/tool/requestUserInput' ? this.requestInput(client, roomId, ev, thread, request) : this.requestApproval(client, roomId, ev, thread, request); f.catch(() => request.method === 'item/tool/requestUserInput' ? client.respondInput(request.id,{}) : client.respondApproval(request.id, 'decline', request)); } });
      item.status = 'replying'; await this.save();
      const files=outputFiles(result.text,cwd);
      for (const file of files) { try { await stat(file.path); } catch (e) { if (e.code==='ENOENT') continue; throw e; } await sendFile(this,roomId,file.path,ev.event_id,thread); }
      const response=result.text.replace(/<send-file\s+path=["'][^"']+["']\s*\/?>/gi,'').replace(/\[SEND_FILE:\s*[^\]]+\]/gi,'').trim();
      if(response) await this.send(roomId, response, ev.event_id, thread);
      item.status = 'delivered'; await this.save();
    } catch (err) {
      this.blockedRooms.add(roomId); this.log('error',`房间 ${roomId} 执行或投递结果未知`);
      console.error('Message outcome unknown; room paused:', item.id, err.message);
      if (item.status === 'started') { try { await this.send(roomId, 'Codex 执行失败或结果未知，当前房间已暂停，请管理员检查。', ev.event_id, thread); } catch { console.error('Failure notification could not be delivered'); } }
    }
    finally { for (const [id, pending] of this.approvals) if (pending.client === client) { clearTimeout(pending.timer); this.approvals.delete(id); } client?.close(); if (item.status === 'delivered') this.state.inbox = this.state.inbox.filter(x => x !== item); await this.save(); }
  }
  async downloadAttachment(content) {
    if (content.file) throw new Error('encrypted attachments are not supported');
    const match = /^mxc:\/\/([^/]+)\/([^/]+)$/.exec(content.url || '');
    if (!match) throw new Error('invalid Matrix attachment URL');
    const limit = 50 * 1024 * 1024;
    if (Number(content.info?.size || 0) > limit) throw new Error('attachment exceeds 50 MiB');
    const base=this.config.homeserver.replace(/\/$/, ''); const part=`${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
    let res = await this.fetch(`${base}/_matrix/client/v1/media/download/${part}`, { redirect:'error', headers: { Authorization: `Bearer ${this.token}` } });
    if ([404,405,501].includes(res.status)) res=await this.fetch(`${base}/_matrix/media/v3/download/${part}`, {redirect:'error',headers:{Authorization:`Bearer ${this.token}`}});
    if (!res.ok) throw new Error(`Matrix media HTTP ${res.status}`);
    if (Number(res.headers?.get('content-length') || 0) > limit) throw new Error('attachment exceeds 50 MiB');
    const chunks = []; let size = 0;
    for await (const chunk of res.body) { size += chunk.length; if (size > limit) throw new Error('attachment exceeds 50 MiB'); chunks.push(chunk); }
    const dir = join(dirname(this.statePath), 'attachments'); await mkdir(dir, {recursive:true,mode:0o700});
    const ext = extname(String(content.body || '')).toLowerCase(); const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
    const file = join(dir, randomUUID() + safeExt); await writeFile(file, Buffer.concat(chunks), {mode:0o600,flag:'wx'}); return file;
  }
  async sendQuestion(id, pending) {
    const q = pending.questions[pending.index];
    const options = (q.options || []).map(o => `• ${o.label}：${o.description}`).join('\n');
    await this.send(pending.roomId, `Codex 请求补充信息：${q.question}\n${options}\n请回复 /answer ${id} 你的回答`, pending.eventId, pending.thread);
  }
  async requestInput(client, roomId, ev, thread, request) {
    const questions = request.params?.questions || [];
    if (!questions.length || questions.some(q => q.isSecret || !q.id || !q.question)) { client.respondInput(request.id,{}); return; }
    const id = randomBytes(6).toString('hex');
    const pending = {type:'input',client,requestId:request.id,roomId,sender:ev.sender,eventId:ev.event_id,thread,questions,index:0,answers:{}};
    pending.timer = setTimeout(() => { if (this.approvals.delete(id)) client.respondInput(request.id,{}); }, 5*60*1000);
    this.approvals.set(id,pending);
    try { await this.sendQuestion(id,pending); } catch(e) { clearTimeout(pending.timer); this.approvals.delete(id); throw e; }
  }
  async requestApproval(client, roomId, ev, thread, request) {
    const id = randomBytes(6).toString('hex');
    const timer = setTimeout(() => { const pending = this.approvals.get(id); if (pending) { this.approvals.delete(id); client.respondApproval(request.id, 'decline', request); } }, 5 * 60 * 1000);
    this.approvals.set(id, { client, requestId:request.id, roomId, timer, request });
    const p = request.params; const detail = request.method.includes('commandExecution') ? String(p.command || '(命令详情不可用)') : request.method.includes('permissions') ? `权限请求：${JSON.stringify(p.permissions || {})}\n${p.reason || ''}` : String(p.reason || '文件修改');
    try { await this.send(roomId, `Codex 请求审批：\n${detail.slice(0,3000)}\n管理员请回复 /approve ${id} 或 /deny ${id}，5 分钟后自动拒绝。`, ev.event_id, thread); }
    catch (e) { clearTimeout(timer); this.approvals.delete(id); throw e; }
  }
  async syncOnce() {
    const initial = !this.state.next_batch; const query = new URLSearchParams({timeout:'30000',...(initial ? {} : {since:this.state.next_batch})});
    const data = await this.api('/_matrix/client/v3/sync?' + query, {signal:this.syncAbort.signal});
    if (typeof data.next_batch !== 'string' || !data.next_batch) throw new Error('Matrix sync response missing next_batch');
    if (data.account_data?.events) {
      for (const ev of data.account_data.events) {
        if (ev.type === 'm.direct' && ev.content) {
          for (const rids of Object.values(ev.content)) {
            if (Array.isArray(rids)) {
              for (const rid of rids) {
                this.directRoomIds.add(rid);
                if (this.state.rooms[rid]) this.state.rooms[rid].is_direct = true;
              }
            }
          }
        }
      }
    }
    if (this.config.auto_join || this.config.invite_policy) for (const [id, invite] of Object.entries(data.rooms?.invite || {})) {
      const event = (invite.invite_state?.events || []).find(ev => ev.type === 'm.room.member' && ev.state_key === this.config.user_id && ev.content?.membership === 'invite');
      if (event) {
        const allowed=inviteAllowed(this.config,event.sender);
        if (allowed || this.config.invite_policy) {
          const inviteId=event.event_id || `${id}:${event.sender || ''}`; this.state.invites ||= {};
          if (!this.state.invites[inviteId]) {
            this.state.invites[inviteId]={roomId:id,status:'started'};await this.save();
            try { 
              const endpoint=allowed?`/_matrix/client/v3/join/${encodeURIComponent(id)}`:`/_matrix/client/v3/rooms/${encodeURIComponent(id)}/leave`;
              await this.api(endpoint,{method:'POST',body:'{}'});
              this.state.invites[inviteId].status='done'; 
              if (allowed && event.content?.is_direct) {
                const info = this.state.rooms[id] ||= {};
                info.is_direct = true;
                await this.markDirect(event.sender, id);
              }
            }
            catch { this.state.invites[inviteId].status='unknown';this.log('error',`房间 ${id} 邀请处理结果未知`); }
            await this.save();
          }
        }
      }
    }
    for (const [id, room] of Object.entries(data.rooms?.join || {})) {
      const info = this.state.rooms[id] ||= {};
      info.peers ||= {};
      for (const ev of [...(room.state?.events || []), ...(room.timeline?.events || [])]) {
        if (ev.type === 'm.room.encryption') info.encrypted = true;
        if (ev.type === 'm.room.name' && typeof ev.content?.name === 'string') info.name=ev.content.name;
        if (ev.type === 'm.room.member' && ev.state_key) {
          if (['join','invite'].includes(ev.content?.membership)) info.peers[ev.state_key]=ev.content.displayname || ev.state_key;
          else if (['leave','ban'].includes(ev.content?.membership)) delete info.peers[ev.state_key];
          if (ev.state_key === this.config.user_id && (ev.content?.is_direct || ev.prev_content?.is_direct)) {
            info.is_direct = true;
            this.directRoomIds.add(id);
            if (ev.sender && ev.sender !== this.config.user_id) await this.markDirect(ev.sender, id);
          }
        }
      }
      if (this.directRoomIds.has(id)) info.is_direct = true;
      const otherPeers = Object.keys(info.peers || {}).filter(p => p !== this.config.user_id);
      if (!info.is_direct && otherPeers.length === 1 && (!info.name || info.name === 'Codex Mini' || (info.peers && info.name === info.peers[otherPeers[0]]))) {
        info.is_direct = true;
        this.directRoomIds.add(id);
        await this.markDirect(otherPeers[0], id);
      }
      if (!initial) for (const ev of room.timeline?.events || []) await this.processEvent(id, ev);
    }
    this.state.next_batch = data.next_batch; await this.save(); this.syncState='online'; this.lastSyncTime=new Date().toISOString();
  }
  setPaused(value) { this.paused=value; this.syncState=value?'paused':'connecting'; if(value) this.syncAbort.abort(); else this.syncAbort=new AbortController(); }
  stop() { this.running = false; this.syncState='offline'; this.syncAbort.abort(); }
  async run() {
    await this.load();
    for (const [id,room] of Object.entries(this.state.rooms)) {
      if (room.is_direct) this.directRoomIds.add(id);
      if (room.migration_candidates?.length) this.blockedRooms.add(id);
    }
    for (const item of this.state.inbox) if (item.status !== 'queued') { this.blockedRooms.add(item.roomId); console.error('Previous message outcome unknown:', item.id); }
    for (const item of this.state.inbox) if (item.status === 'queued' && !this.blockedRooms.has(item.roomId)) this.enqueue(item);
    if (this.token && !this.paused) await this.refreshDirectRooms();
    this.running = true; while (this.running) { if (!this.token || this.paused) { if(!this.token) this.syncState='unconfigured'; await new Promise(r=>setTimeout(r,1000)); continue; } try { if(this.syncState!=='online')this.syncState='connecting'; await this.syncOnce(); } catch (e) { if (!this.running) break; if(this.paused || e.name==='AbortError') continue; this.syncState='error'; this.log('error','Matrix 同步失败'); console.error('sync failed:', e.message); await new Promise(r => setTimeout(r, 5000)); } } await Promise.allSettled([...this.queues.values()]); }
}
