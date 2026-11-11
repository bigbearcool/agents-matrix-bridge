import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class CodexClient extends EventEmitter {
  constructor(command, env = process.env) {
    super(); this.seq = 0; this.pending = new Map();
    this.child = spawn(command, ['app-server', '--listen', 'stdio://'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.method && msg.id !== undefined) {
        if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput'].includes(msg.method)) {
          this.emit('approval', { id: msg.id, method: msg.method, params: msg.params || {} });
        } else {
          this.child.stdin.write(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'Unsupported server request' } }) + '\n');
        }
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id); clearTimeout(p.timer);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); return;
      }
      if (msg.method) this.emit('notification', msg.method, msg.params);
    });
    const fail = () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex app-server exited')); } this.pending.clear(); this.emit('closed'); };
    this.child.on('error', fail); this.child.on('exit', fail);
  }
  request(method, params) { return new Promise((resolve, reject) => { const id = ++this.seq; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} request timed out; outcome unknown`)); }, 30000); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', err => { if (err && this.pending.has(id)) { this.pending.delete(id); clearTimeout(timer); reject(err); } }); }); }
  async initialize() { await this.request('initialize', { clientInfo: { name: 'matrix_bridge', title: 'Matrix Bridge', version: '0.1.0' } }); this.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n'); }
  respondInput(id, answers) { this.child.stdin.write(JSON.stringify({id,result:{answers}}) + '\n'); }
  respondApproval(id, decision, request) { const result = request?.method === 'item/permissions/requestApproval' ? { permissions: decision === 'accept' ? request.params.permissions : {}, ...(decision === 'accept' ? {scope:'turn'} : {}) } : {decision}; this.child.stdin.write(JSON.stringify({ id, result }) + '\n'); }
  async turn({ threadId, cwd, text, attachments = [], model = '', effort = '', onThread, onApproval = () => {} }) {
    const opts = { cwd, approvalPolicy: 'on-request', sandbox: 'read-only' };
    const started = await this.request(threadId ? 'thread/resume' : 'thread/start', threadId ? { ...opts, threadId } : opts);
    const id = started.thread.id; await onThread(id);
    let answer = ''; let approval = false; let activeTurn;
    const done = new Promise((resolve, reject) => {
      const handler = (method, p) => {
        if (p?.threadId !== id) return;
        if (method === 'item/completed' && p.item?.type === 'agentMessage') answer = p.item.text || '';
        if (method === 'turn/completed' && (!activeTurn || p.turn?.id === activeTurn)) { cleanup(); resolve(p.turn); }
      };
      const handleApproval = request => { approval = true; onApproval(request); };
      const onClose = () => { cleanup(); reject(new Error('Codex app-server exited during turn')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Codex turn timed out; outcome unknown')); }, 30 * 60 * 1000);
      const cleanup = () => { clearTimeout(timer); this.off('notification', handler); this.off('approval', handleApproval); this.off('closed', onClose); };
      this.on('notification', handler); this.on('approval', handleApproval); this.on('closed', onClose);
    });
    try { const turn = await this.request('turn/start', { threadId: id, ...(model ? {model} : {}), ...(effort ? {effort} : {}), input: [{ type: 'text', text, text_elements: [] }, ...attachments] }); activeTurn = turn.turn.id; }
    catch (err) { this.child.kill(); await done.catch(() => {}); throw err; }
    const result = await done;
    if (result.status !== 'completed') throw new Error(`Codex turn ${result.status || 'failed'}${approval ? '; approval was unavailable' : ''}`);
    return { text: answer || '（执行结束，未返回文本）', approval };
  }
  close() { this.child.kill(); }
}
