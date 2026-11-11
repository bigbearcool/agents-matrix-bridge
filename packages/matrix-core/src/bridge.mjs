import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
import { assertAgentRuntimeAdapter, normalizeTurnResult } from './adapter.mjs';
import { handleCommand, parseCommand, readModelCatalog } from './commands.mjs';
import {
  domain,
  authorized,
  isAdmin,
  inviteAllowed,
  redact,
  evaluateAdmission,
  transportAllowed,
  isUndecryptable,
  rateLimitAllows
} from './security.mjs';
import { sendFile, outputFiles, downloadMedia } from './media.mjs';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Keep the constructor forgiving for lightweight test/embedding adapters while
 * still requiring the one method that cannot have a meaningful default.
 */
function coerceAdapter(candidate) {
  if (!candidate || typeof candidate.executeTurn !== 'function') {
    throw new TypeError('adapter.executeTurn must be a function');
  }
  if (typeof candidate.listAvailableModels === 'function' && typeof candidate.resetSession === 'function') {
    return assertAgentRuntimeAdapter(candidate);
  }
  try {
    if (typeof candidate.listAvailableModels !== 'function') {
      candidate.listAvailableModels = async () => ({ models: [], efforts: [] });
    }
    if (typeof candidate.resetSession !== 'function') candidate.resetSession = async () => {};
    if (typeof candidate.name !== 'string') candidate.name = 'generic';
    if (typeof candidate.defaultCliPath !== 'string') candidate.defaultCliPath = '';
    return assertAgentRuntimeAdapter(candidate);
  } catch {
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'generic',
      defaultCliPath: typeof candidate.defaultCliPath === 'string' ? candidate.defaultCliPath : '',
      executeTurn: candidate.executeTurn.bind(candidate),
      listAvailableModels: typeof candidate.listAvailableModels === 'function'
        ? candidate.listAvailableModels.bind(candidate)
        : async () => ({ models: [], efforts: [] }),
      resetSession: typeof candidate.resetSession === 'function'
        ? candidate.resetSession.bind(candidate)
        : async () => {}
    };
  }
}

/**
 * Matrix bridge engine.
 *
 * Owns Matrix transport (sync, E2EE proxy awareness, DMs, invites), room state,
 * queues, approvals, persistence and media — but knows nothing about the agent
 * runtime beyond the {@link AgentRuntimeAdapter} contract.
 *
 * Usage:
 *   const bridge = new Bridge({ config, adapter, token, fetchImpl });
 */
export class Bridge {
  constructor(options = {}, legacyToken, legacyOptions = {}) {
    const legacy = !('config' in options) && ('homeserver' in options || 'user_id' in options);
    const config = legacy ? options : options.config;
    const extra = legacy ? { ...options, ...legacyOptions, token: legacyToken ?? legacyOptions.token } : options;
    if (!config || typeof config !== 'object') throw new TypeError('Bridge requires a config object');

    this.config = config;
    this.adapter = coerceAdapter(extra.adapter);
    this.token = extra.token ?? extra.accessToken ?? '';
    this.fetch = extra.fetchImpl || fetch;
    this.state = { rooms: {}, inbox: [], settings: {} };
    this.running = false;
    this.statePath = extra.statePath || config.state_path || join(homedir(), '.matrix-bridge', 'state.json');
    this.saves = Promise.resolve();
    this.queues = new Map();
    this.approvals = new Map();
    this.blockedRooms = new Set();
    this.syncAbort = new AbortController();
    this.paused = false;
    this.syncState = 'offline';
    this.lastSyncTime = '';
    this.activity = [];
    this.senderRates = new Map();
    this.directRoomIds = new Set(config.direct_rooms || []);
  }

  log(kind, message) {
    this.activity.push({ time: new Date().toISOString(), kind, message });
    if (this.activity.length > 300) this.activity.shift();
  }

  get agentLabel() {
    const name = this.adapter?.name && this.adapter.name !== 'generic' ? this.adapter.name : 'Agent';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  async load() {
    try {
      this.state = JSON.parse(await readFile(this.statePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.state.rooms ||= {};
    this.state.inbox ||= [];
    this.state.settings ||= {};
  }

  async save() {
    const snapshot = JSON.stringify(this.state);
    this.saves = this.saves.catch(() => {}).then(async () => {
      await mkdir(dirname(this.statePath), { recursive: true, mode: 0o700 });
      const tmp = this.statePath + '.' + randomUUID();
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.statePath);
    });
    await this.saves;
  }

  async api(path, options = {}) {
    const res = await this.fetch(this.config.homeserver.replace(/\/$/, '') + path, {
      redirect: 'error',
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (!res.ok) throw new Error(`Matrix HTTP ${res.status}`);
    return res.json();
  }

  async send(roomId, text, eventId, threadRoot) {
    const relates = threadRoot
      ? { rel_type: 'm.thread', event_id: threadRoot, is_falling_back: true, 'm.in_reply_to': { event_id: eventId } }
      : eventId
        ? { 'm.in_reply_to': { event_id: eventId } }
        : null;
    const body = {
      msgtype: 'm.text',
      body: redact(text, this.config.redact_sensitive === true, this.token),
      ...(relates ? { 'm.relates_to': relates } : {})
    };
    const result = await this.api(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${randomUUID()}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    await this.rememberSent(roomId, result.event_id);
    return result;
  }

  async rememberSent(roomId, eventId) {
    if (!eventId) return;
    const room = this.state.rooms[roomId] ||= {};
    room.bot_events ||= [];
    room.bot_events.push(eventId);
    if (room.bot_events.length > 500) room.bot_events.splice(0, room.bot_events.length - 500);
    await this.save();
  }

  authorized(sender) {
    return authorized(this.config, sender);
  }

  async directed(roomId, ev, ignoreGlobal = false) {
    const body = ev.content?.body || '';
    const bot = this.config.user_id;
    const at = body.indexOf(bot);
    const replyId = ev.content?.['m.relates_to']?.['m.in_reply_to']?.event_id;
    const after = at < 0 ? '' : body[at + bot.length] || '';
    if (
      (this.state.rooms[roomId]?.bot_events || []).includes(replyId) ||
      (this.config.direct_rooms || []).includes(roomId) ||
      (ev.content?.['m.mentions']?.user_ids || []).includes(bot) ||
      (at >= 0 && !/[\p{L}\p{N}._=\/:-]/u.test(after)) ||
      (!ignoreGlobal && this.config.group_reply_all === true)
    ) return true;
    return this.isDirect(roomId, ev);
  }

  async refreshDirectRooms() {
    try {
      const bot = this.config.user_id;
      const direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`);
      for (const rids of Object.values(direct || {})) {
        if (!Array.isArray(rids)) continue;
        for (const rid of rids) {
          this.directRoomIds.add(rid);
          if (this.state.rooms[rid]) this.state.rooms[rid].is_direct = true;
        }
      }
    } catch {
      // A missing m.direct account-data block is normal for new accounts.
    }
  }

  async markDirect(userId, roomId) {
    if (!userId || !roomId) return;
    this.directRoomIds.add(roomId);
    if (this.state.rooms[roomId]) this.state.rooms[roomId].is_direct = true;
    try {
      const bot = this.config.user_id;
      let direct = {};
      try {
        direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`);
      } catch {
        direct = {};
      }
      direct[userId] ||= [];
      if (!direct[userId].includes(roomId)) {
        direct[userId].push(roomId);
        await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`, {
          method: 'PUT',
          body: JSON.stringify(direct)
        });
      }
    } catch {
      // Self-healing is best effort; the in-memory DM set still applies.
    }
  }

  async isDirect(roomId, ev) {
    const bot = this.config.user_id;
    if (
      this.directRoomIds.has(roomId) ||
      (this.config.direct_rooms || []).includes(roomId) ||
      this.state.rooms[roomId]?.is_direct
    ) return true;
    try {
      const direct = await this.api(`/_matrix/client/v3/user/${encodeURIComponent(bot)}/account_data/m.direct`);
      for (const rids of Object.values(direct || {})) {
        if (!Array.isArray(rids)) continue;
        for (const rid of rids) this.directRoomIds.add(rid);
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
    } catch {
      return false;
    }
    return false;
  }

  async processEvent(roomId, ev) {
    if (
      ev.type !== 'm.room.message' ||
      ev.sender === this.config.user_id ||
      !['m.text', 'm.image', 'm.file', 'm.audio', 'm.video'].includes(ev.content?.msgtype) ||
      !ev.event_id ||
      !this.authorized(ev.sender)
    ) return;

    const body = String(ev.content.body || '').trim() ||
      (ev.content.msgtype !== 'm.text' && ev.content.url ? '附件' : '');
    if (isUndecryptable(body)) {
      this.log('warn', `房间 ${roomId} 消息尚未解密`);
      return;
    }

    const input = body.match(/^\/answer\s+([a-f0-9]{12})\s+([\s\S]+)$/i);
    if (input) {
      const pending = this.approvals.get(input[1]);
      if (
        pending && pending.type === 'input' &&
        pending.roomId === roomId &&
        (pending.sender === ev.sender || (this.config.admins || []).includes(ev.sender))
      ) {
        pending.answers[pending.questions[pending.index].id] = { answers: [input[2]] };
        pending.index++;
        if (pending.index === pending.questions.length) {
          this.approvals.delete(input[1]);
          clearTimeout(pending.timer);
          pending.resolve(pending.answers);
        } else {
          await this.sendQuestion(input[1], pending);
        }
      }
      return;
    }

    const approval = body.match(/^\/(approve|deny)\s+([a-f0-9]{12})\s*$/i);
    if (approval) {
      const pending = this.approvals.get(approval[2]);
      if (
        pending && pending.type !== 'input' &&
        pending.roomId === roomId &&
        (this.config.admins || []).includes(ev.sender)
      ) {
        this.approvals.delete(approval[2]);
        clearTimeout(pending.timer);
        pending.resolve(approval[1].toLowerCase() === 'approve' ? 'accept' : 'decline');
      }
      return;
    }

    if (!body || !transportAllowed(this.config, this.state.rooms[roomId] || {})) return;

    const room = this.state.rooms[roomId] ||= {};
    const addressed = await this.directed(roomId, ev, true);
    const stripped = body.startsWith(this.config.user_id) ? body.slice(this.config.user_id.length).trimStart() : body;
    const isCommand = stripped.startsWith('/');
    const needsDirectResolution = !room.policy || room.policy === 'default';
    const directDefault = needsDirectResolution ? await this.isDirect(roomId, ev) : false;
    const decision = evaluateAdmission({
      config: this.config,
      sender: ev.sender,
      room,
      isDirect: directDefault,
      isCommand,
      addressed
    });
    if (!decision.allowed) return;

    const admin = isAdmin(this.config, ev.sender);
    if (!isCommand && !rateLimitAllows(this, ev.sender, body, {
      enabled: this.config.rate_limit_enabled === true,
      admin
    })) return;

    if (!isCommand && this.config.federated_room_guard && !(this.config.direct_rooms || []).includes(roomId)) {
      try {
        const data = await this.api(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`);
        const ids = Object.keys(data.joined || {});
        if (
          !ids.length ||
          (domain(roomId) && domain(roomId) !== domain(this.config.user_id)) ||
          ids.some((id) => domain(id) !== domain(this.config.user_id))
        ) return;
      } catch {
        return;
      }
    }

    room.processed_events ||= [];
    if (room.processed_events.includes(ev.event_id)) return;
    room.processed_events.push(ev.event_id);
    const needsDirect = /^\/(new|reset)(?:\s|$)/i.test(stripped);
    this.log('message', `收到房间消息 ${roomId}`);
    const item = {
      id: ev.event_id,
      roomId,
      ev,
      isDirect: needsDirect ? await this.isDirect(roomId, ev) : false,
      status: 'queued'
    };
    this.state.inbox.push(item);
    await this.save();
    this.enqueue(item);
  }

  enqueue(item) {
    const prev = this.queues.get(item.roomId) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this.execute(item))
      .catch((error) => console.error('message processing failed:', error.message));
    this.queues.set(item.roomId, next);
    next.finally(() => {
      if (this.queues.get(item.roomId) === next) this.queues.delete(item.roomId);
    });
  }

  persistThread(room, thread, id) {
    if (!id) return;
    if (thread) {
      room.thread_sessions ||= {};
      room.thread_sessions[thread] = id;
      if (room.active_session && room.sessions?.[room.active_session]) {
        room.sessions[room.active_session].thread_sessions = room.thread_sessions;
      }
    } else {
      room.thread_id = id;
      if (room.active_session && room.sessions?.[room.active_session]) {
        room.sessions[room.active_session].thread_id = id;
      }
    }
  }

  async execute(item) {
    if (this.blockedRooms.has(item.roomId)) return;
    item.status = 'started';
    await this.save();
    const { roomId, ev } = item;
    const room = this.state.rooms[roomId];
    const rel = ev.content['m.relates_to'];
    const thread = rel?.rel_type === 'm.thread' ? rel.event_id : '';
    room.thread_sessions ||= {};
    const oldThreadId = thread ? room.thread_sessions[thread] : room.thread_id;
    const turnApprovals = new Set();

    try {
      let body = String(ev.content.body || '').trim();
      if (body.startsWith(this.config.user_id)) body = body.slice(this.config.user_id.length).trimStart();

      const uploadCommand = /^\/(sendfile|upload)(?:\s+([\s\S]+))?$/i.exec(body);
      if (uploadCommand) {
        if (!isAdmin(this.config, ev.sender)) {
          item.status = 'replying';
          await this.save();
          await this.send(roomId, '只有管理员可以发送文件。', ev.event_id, thread);
        } else if (!uploadCommand[2]) {
          item.status = 'replying';
          await this.save();
          await this.send(roomId, '用法：/sendfile <路径>', ev.event_id, thread);
        } else {
          const raw = uploadCommand[2].trim();
          const path = isAbsolute(raw) ? raw : resolve(room.workspace || this.config.cwd, raw);
          item.status = 'replying';
          await this.save();
          await sendFile(this, roomId, path, ev.event_id, thread);
        }
        item.status = 'delivered';
        await this.save();
        return;
      }

      const command = ev.content.msgtype === 'm.text' ? parseCommand(ev.content.body, this.config) : null;
      const commandResult = ev.content.msgtype !== 'm.text'
        ? null
        : await handleCommand({
            body: ev.content.body,
            room,
            config: this.config,
            sender: ev.sender,
            settings: this.state.settings,
            thread,
            isDirect: item.isDirect,
            adapter: this.adapter
          });

      if (commandResult !== null) {
        if (command && ['new', 'reset'].includes(command.name) && !/^(只有|群聊)/.test(commandResult)) {
          try {
            await this.adapter.resetSession(roomId, oldThreadId || '');
          } catch (error) {
            this.log('warn', `重置 ${this.adapter.name} 会话失败：${error.message}`);
          }
        }
        await this.save();
        item.status = 'replying';
        await this.save();
        await this.send(roomId, commandResult, ev.event_id, thread);
        item.status = 'delivered';
        await this.save();
        return;
      }

      let cwd = room.workspace || this.config.cwd;
      if (!room.workspace && this.config.isolate_unbound_rooms) {
        cwd = join(dirname(this.statePath), 'sandbox');
        await mkdir(cwd, { recursive: true, mode: 0o700 });
      }

      let text = `[Matrix 发言人: ${room.peers?.[ev.sender] || ev.sender} (${ev.sender})]\n${ev.content.body}`;
      const attachments = [];
      if (ev.content.msgtype !== 'm.text') {
        const file = await this.downloadAttachment(ev.content);
        text += `\n附件名称：${ev.content.body || 'attachment'}\n媒体类型：${ev.content.info?.mimetype || '未知'}\n本地路径：${file}`;
        if (ev.content.msgtype === 'm.image') attachments.push({ type: 'localImage', path: file });
        else if (ev.content.msgtype === 'm.audio') attachments.push({ type: 'localAudio', path: file });
        else text += `\n附件本地路径：${file}`;
      }

      const result = normalizeTurnResult(await this.adapter.executeTurn({
        prompt: text,
        cwd,
        model: room.model || this.state.settings.default_model || '',
        effort: room.effort || this.state.settings.default_effort || '',
        threadId: thread ? room.thread_sessions[thread] : room.thread_id,
        attachments,
        roomId,
        threadRoot: thread,
        sender: ev.sender,
        onThread: async (id) => {
          this.persistThread(room, thread, id);
          await this.save();
        },
        onApproval: (request) => request?.method === 'item/tool/requestUserInput'
          ? this.requestInput(roomId, ev, thread, request, turnApprovals)
          : this.requestApproval(roomId, ev, thread, request, turnApprovals),
        onInput: (request) => this.requestInput(roomId, ev, thread, request, turnApprovals)
      }));

      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.threadId && result.threadId !== (thread ? room.thread_sessions[thread] : room.thread_id)) {
        this.persistThread(room, thread, result.threadId);
      }

      item.status = 'replying';
      await this.save();

      const paths = new Set(result.generatedFiles.map((path) => isAbsolute(path) ? path : resolve(cwd, path)));
      for (const file of outputFiles(result.replyText, cwd)) paths.add(file.path);
      for (const path of paths) {
        try {
          await stat(path);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        await sendFile(this, roomId, path, ev.event_id, thread);
      }

      const response = result.replyText
        .replace(/<send-file\s+path=["'][^"']+["']\s*\/?>/gi, '')
        .replace(/\[SEND_FILE:\s*[^\]]+\]/gi, '')
        .trim();
      if (response) await this.send(roomId, response, ev.event_id, thread);
      item.status = 'delivered';
      await this.save();
    } catch (error) {
      this.blockedRooms.add(roomId);
      this.log('error', `房间 ${roomId} 执行或投递结果未知`);
      console.error('Message outcome unknown; room paused:', item.id, error.message);
      if (item.status === 'started') {
        try {
          await this.send(roomId, `${this.agentLabel} 执行失败或结果未知，当前房间已暂停，请管理员检查。`, ev.event_id, thread);
        } catch {
          console.error('Failure notification could not be delivered');
        }
      }
    } finally {
      for (const id of turnApprovals) {
        const pending = this.approvals.get(id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.approvals.delete(id);
        try {
          pending.resolve(pending.type === 'input' ? {} : 'decline');
        } catch {
          // Already settled.
        }
      }
      if (item.status === 'delivered') this.state.inbox = this.state.inbox.filter((x) => x !== item);
      await this.save();
    }
  }

  async downloadAttachment(content) {
    return downloadMedia({
      fetchImpl: this.fetch,
      homeserver: this.config.homeserver,
      token: this.token,
      content,
      cacheDir: join(dirname(this.statePath), 'attachments')
    });
  }

  async sendQuestion(id, pending) {
    const question = pending.questions[pending.index];
    const options = (question.options || []).map((option) => `• ${option.label}：${option.description}`).join('\n');
    await this.send(
      pending.roomId,
      `${this.agentLabel} 请求补充信息：${question.question}\n${options}\n请回复 /answer ${id} 你的回答`,
      pending.eventId,
      pending.thread
    );
  }

  async requestInput(roomId, ev, thread, request, tracked) {
    const questions = request?.params?.questions || [];
    const invalid = !questions.length || questions.some((question) => question.isSecret || !question.id || !question.question);
    if (invalid) return {};
    const id = randomBytes(6).toString('hex');
    let resolveAnswer;
    const answer = new Promise((resolve) => { resolveAnswer = resolve; });
    const pending = {
      type: 'input',
      requestId: request.id,
      roomId,
      sender: ev.sender,
      eventId: ev.event_id,
      thread,
      questions,
      index: 0,
      answers: {},
      resolve: resolveAnswer
    };
    pending.timer = setTimeout(() => {
      if (this.approvals.delete(id)) resolveAnswer({});
    }, APPROVAL_TIMEOUT_MS);
    this.approvals.set(id, pending);
    tracked?.add(id);
    try {
      await this.sendQuestion(id, pending);
    } catch (error) {
      clearTimeout(pending.timer);
      this.approvals.delete(id);
      tracked?.delete(id);
      resolveAnswer({});
      this.log('warn', `补充信息请求投递失败：${error.message}`);
    }
    return answer;
  }

  async requestApproval(roomId, ev, thread, request, tracked) {
    const id = randomBytes(6).toString('hex');
    let resolveDecision;
    const decision = new Promise((resolve) => { resolveDecision = resolve; });
    const timer = setTimeout(() => {
      if (this.approvals.delete(id)) resolveDecision('decline');
    }, APPROVAL_TIMEOUT_MS);
    this.approvals.set(id, {
      type: 'approval',
      requestId: request.id,
      roomId,
      sender: ev.sender,
      eventId: ev.event_id,
      thread,
      timer,
      request,
      resolve: resolveDecision
    });
    tracked?.add(id);

    const params = request.params || {};
    const method = String(request.method || '');
    const detail = method.includes('commandExecution')
      ? String(params.command || '(命令详情不可用)')
      : method.includes('permissions')
        ? `权限请求：${JSON.stringify(params.permissions || {})}\n${params.reason || ''}`
        : String(params.reason || '文件修改');
    try {
      await this.send(
        roomId,
        `${this.agentLabel} 请求审批：\n${detail.slice(0, 3000)}\n管理员请回复 /approve ${id} 或 /deny ${id}，5 分钟后自动拒绝。`,
        ev.event_id,
        thread
      );
    } catch (error) {
      clearTimeout(timer);
      this.approvals.delete(id);
      tracked?.delete(id);
      resolveDecision('decline');
      this.log('warn', `审批请求投递失败：${error.message}`);
    }
    return decision;
  }

  /** Settle a pending approval from an embedding UI. */
  respondApproval(id, decision) {
    const pending = this.approvals.get(id);
    if (!pending || pending.type === 'input') return false;
    this.approvals.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(String(decision).toLowerCase() === 'accept' || decision === 'approve' ? 'accept' : 'decline');
    return true;
  }

  /** Settle a pending input request from an embedding UI. */
  respondInput(id, answers = {}) {
    const pending = this.approvals.get(id);
    if (!pending || pending.type !== 'input') return false;
    this.approvals.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(answers);
    return true;
  }

  async listAvailableModels() {
    return readModelCatalog(this.adapter);
  }

  async syncOnce() {
    const initial = !this.state.next_batch;
    const query = new URLSearchParams({ timeout: '30000', ...(initial ? {} : { since: this.state.next_batch }) });
    const data = await this.api('/_matrix/client/v3/sync?' + query, { signal: this.syncAbort.signal });
    if (typeof data.next_batch !== 'string' || !data.next_batch) throw new Error('Matrix sync response missing next_batch');

    if (data.account_data?.events) {
      for (const ev of data.account_data.events) {
        if (ev.type !== 'm.direct' || !ev.content) continue;
        for (const rids of Object.values(ev.content)) {
          if (!Array.isArray(rids)) continue;
          for (const rid of rids) {
            this.directRoomIds.add(rid);
            if (this.state.rooms[rid]) this.state.rooms[rid].is_direct = true;
          }
        }
      }
    }

    if (this.config.auto_join || this.config.invite_policy) {
      for (const [id, invite] of Object.entries(data.rooms?.invite || {})) {
        const event = (invite.invite_state?.events || []).find(
          (ev) => ev.type === 'm.room.member' && ev.state_key === this.config.user_id && ev.content?.membership === 'invite'
        );
        if (!event) continue;
        const allowed = inviteAllowed(this.config, event.sender);
        if (!allowed && !this.config.invite_policy) continue;
        const inviteId = event.event_id || `${id}:${event.sender || ''}`;
        this.state.invites ||= {};
        if (this.state.invites[inviteId]) continue;
        this.state.invites[inviteId] = { roomId: id, status: 'started' };
        await this.save();
        try {
          const endpoint = allowed
            ? `/_matrix/client/v3/join/${encodeURIComponent(id)}`
            : `/_matrix/client/v3/rooms/${encodeURIComponent(id)}/leave`;
          await this.api(endpoint, { method: 'POST', body: '{}' });
          this.state.invites[inviteId].status = 'done';
          if (allowed && event.content?.is_direct) {
            const info = this.state.rooms[id] ||= {};
            info.is_direct = true;
            await this.markDirect(event.sender, id);
          }
        } catch {
          this.state.invites[inviteId].status = 'unknown';
          this.log('error', `房间 ${id} 邀请处理结果未知`);
        }
        await this.save();
      }
    }

    for (const [id, room] of Object.entries(data.rooms?.join || {})) {
      const info = this.state.rooms[id] ||= {};
      info.peers ||= {};
      for (const ev of [...(room.state?.events || []), ...(room.timeline?.events || [])]) {
        if (ev.type === 'm.room.encryption') info.encrypted = true;
        if (ev.type === 'm.room.name' && typeof ev.content?.name === 'string') info.name = ev.content.name;
        if (ev.type === 'm.room.member' && ev.state_key) {
          if (['join', 'invite'].includes(ev.content?.membership)) {
            info.peers[ev.state_key] = ev.content.displayname || ev.state_key;
          } else if (['leave', 'ban'].includes(ev.content?.membership)) {
            delete info.peers[ev.state_key];
          }
          if (ev.state_key === this.config.user_id && (ev.content?.is_direct || ev.prev_content?.is_direct)) {
            info.is_direct = true;
            this.directRoomIds.add(id);
            if (ev.sender && ev.sender !== this.config.user_id) await this.markDirect(ev.sender, id);
          }
        }
      }
      if (this.directRoomIds.has(id)) info.is_direct = true;
      const otherPeers = Object.keys(info.peers || {}).filter((peer) => peer !== this.config.user_id);
      const defaultRoomName = this.config.default_room_name || '';
      if (
        !info.is_direct && otherPeers.length === 1 &&
        (!info.name || info.name === defaultRoomName || (info.peers && info.name === info.peers[otherPeers[0]]))
      ) {
        info.is_direct = true;
        this.directRoomIds.add(id);
        await this.markDirect(otherPeers[0], id);
      }
      if (!initial) {
        for (const ev of room.timeline?.events || []) await this.processEvent(id, ev);
      }
    }

    this.state.next_batch = data.next_batch;
    await this.save();
    this.syncState = 'online';
    this.lastSyncTime = new Date().toISOString();
  }

  setPaused(value) {
    this.paused = value;
    this.syncState = value ? 'paused' : 'connecting';
    if (value) this.syncAbort.abort();
    else this.syncAbort = new AbortController();
  }

  stop() {
    this.running = false;
    this.syncState = 'offline';
    this.syncAbort.abort();
  }

  async run() {
    await this.load();
    for (const [id, room] of Object.entries(this.state.rooms)) {
      if (room.is_direct) this.directRoomIds.add(id);
      if (room.migration_candidates?.length) this.blockedRooms.add(id);
    }
    for (const item of this.state.inbox) {
      if (item.status !== 'queued') {
        this.blockedRooms.add(item.roomId);
        console.error('Previous message outcome unknown:', item.id);
      }
    }
    for (const item of this.state.inbox) {
      if (item.status === 'queued' && !this.blockedRooms.has(item.roomId)) this.enqueue(item);
    }
    if (this.token && !this.paused) await this.refreshDirectRooms();
    this.running = true;
    while (this.running) {
      if (!this.token || this.paused) {
        if (!this.token) this.syncState = 'unconfigured';
        await new Promise((resolveTimer) => setTimeout(resolveTimer, 1000));
        continue;
      }
      try {
        if (this.syncState !== 'online') this.syncState = 'connecting';
        await this.syncOnce();
      } catch (error) {
        if (!this.running) break;
        if (this.paused || error.name === 'AbortError') continue;
        this.syncState = 'error';
        this.log('error', 'Matrix 同步失败');
        console.error('sync failed:', error.message);
        await new Promise((resolveTimer) => setTimeout(resolveTimer, 5000));
      }
    }
    await Promise.allSettled([...this.queues.values()]);
  }
}

export { AgentRuntimeAdapter } from './adapter.mjs';
