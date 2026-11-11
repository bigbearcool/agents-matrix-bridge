import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bridge } from '../src/bridge.mjs';
import { AgentRuntimeAdapter } from '../src/adapter.mjs';

async function makeDir(prefix = 'matrix-core-bridge-') {
  return mkdtemp(join(tmpdir(), prefix));
}

function baseConfig(dir, overrides = {}) {
  return {
    homeserver: 'https://example.org',
    user_id: '@bot:example.org',
    allowed_senders: ['*'],
    direct_rooms: ['!r'],
    cwd: dir,
    state_path: join(dir, 'state.json'),
    ...overrides
  };
}

function matrixFetch({ sent = [], turns = [], sync = null } = {}) {
  return async (url, options = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      sent.push(body);
      return { ok: true, json: async () => ({ event_id: `$bot${sent.length}` }) };
    }
    if (options.method === 'POST') {
      return { ok: true, json: async () => ({ content_uri: 'mxc://example.org/uploaded' }) };
    }
    if (sync) return sync(url, options);
    return { ok: true, json: async () => ({}) };
  };
}

function message(eventId, body, sender = '@user:example.org', extra = {}) {
  return {
    event_id: eventId,
    type: 'm.room.message',
    sender,
    content: { msgtype: 'm.text', body, ...extra }
  };
}

test('turns go through the adapter and thread context returns to the bridge', async () => {
  const dir = await makeDir();
  const calls = [];
  const sent = [];
  class FakeAdapter extends AgentRuntimeAdapter {
    constructor() { super({ name: 'fake', defaultCliPath: '/bin/fake' }); }
    async executeTurn(params) {
      calls.push(params);
      const threadId = params.threadId || 'thread-1';
      await params.onThread(threadId);
      return { replyText: `answer-${calls.length}` };
    }
  }
  const bridge = new Bridge({
    config: baseConfig(dir),
    adapter: new FakeAdapter(),
    token: 'test-token',
    fetchImpl: matrixFetch({ sent })
  });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'hello'));
  await bridge.queues.get('!r');
  await bridge.processEvent('!r', message('$2', 'again'));
  await bridge.queues.get('!r');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].prompt.includes('hello'), true);
  assert.match(calls[0].prompt, /Matrix 发言人/);
  assert.equal(calls[0].cwd, dir);
  assert.equal(calls[0].roomId, '!r');
  assert.equal(calls[0].threadId, undefined);
  assert.equal(calls[1].threadId, 'thread-1');
  assert.equal(typeof calls[0].onApproval, 'function');
  assert.equal(typeof calls[0].onInput, 'function');
  assert.deepEqual(sent.map((entry) => entry.body), ['answer-1', 'answer-2']);
  assert.equal(bridge.state.rooms['!r'].thread_id, 'thread-1');
  assert.equal(bridge.state.inbox.length, 0);
});

test('lightweight adapters receive safe defaults for optional methods', async () => {
  const dir = await makeDir();
  const adapter = { executeTurn: async () => ({ replyText: 'ok' }) };
  const bridge = new Bridge({ config: baseConfig(dir), adapter, token: 't', fetchImpl: matrixFetch() });
  assert.equal(bridge.adapter, adapter);
  assert.equal(bridge.adapter.name, 'generic');
  assert.deepEqual(await bridge.adapter.listAvailableModels(), { models: [], efforts: [] });
  assert.equal(await bridge.adapter.resetSession('!r', 't1'), undefined);
  await assert.rejects(
    () => Promise.resolve().then(() => new Bridge({ config: baseConfig(dir), adapter: {}, token: 't' })),
    /executeTurn must be a function/
  );
});

test('/model list asks the adapter for its catalog instead of spawning a client', async () => {
  const dir = await makeDir();
  const sent = [];
  const calls = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { calls.push(1); return { replyText: 'should not run' }; };
  adapter.listAvailableModels = async () => ({
    models: [{ id: 'm1', name: 'Model One', description: 'first' }],
    efforts: ['low', 'high']
  });
  const bridge = new Bridge({ config: baseConfig(dir), adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', '/model list', '@admin:example.org'));
  await bridge.queues.get('!r');

  assert.equal(calls.length, 0);
  assert.match(sent[0].body, /可选模型/);
  assert.match(sent[0].body, /• m1：first/);
});

test('/new resets the adapter session with the abandoned thread id', async () => {
  const dir = await makeDir();
  const resets = [];
  const threadIds = [];
  const sent = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async (params) => {
    threadIds.push(params.threadId);
    await params.onThread(`thread-${threadIds.length}`);
    return { replyText: 'ok' };
  };
  adapter.resetSession = async (roomId, threadId) => { resets.push({ roomId, threadId }); };
  const bridge = new Bridge({ config: baseConfig(dir), adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'hello'));
  await bridge.queues.get('!r');
  await bridge.processEvent('!r', message('$2', '/new next', '@admin:example.org'));
  await bridge.queues.get('!r');
  await bridge.processEvent('!r', message('$3', 'after reset'));
  await bridge.queues.get('!r');

  assert.deepEqual(resets, [{ roomId: '!r', threadId: 'thread-1' }]);
  assert.deepEqual(threadIds, [undefined, '']);
  assert.equal(bridge.state.rooms['!r'].active_session, 's2');
});

test('approval requests reach administrators in the room and resume the adapter turn', async () => {
  const dir = await makeDir();
  const sent = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async (params) => {
    const decision = await params.onApproval({
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'rm -rf build' }
    });
    return { replyText: `decision:${decision}` };
  };
  const config = baseConfig(dir, { admins: ['@admin:example.org'] });
  const bridge = new Bridge({ config, adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'do it'));
  for (let index = 0; index < 100 && !bridge.approvals.size; index++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(bridge.approvals.size, 1);
  const id = [...bridge.approvals.keys()][0];
  assert.match(sent[0].body, /请求审批/);
  assert.match(sent[0].body, /rm -rf build/);

  await bridge.processEvent('!r', message('$2', `/approve ${id}`));
  assert.equal(bridge.approvals.size, 1);
  await bridge.processEvent('!other', message('$3', `/approve ${id}`, '@admin:example.org'));
  assert.equal(bridge.approvals.size, 1);
  await bridge.processEvent('!r', message('$4', `/approve ${id}`, '@admin:example.org'));
  await bridge.queues.get('!r');

  assert.equal(bridge.approvals.size, 0);
  assert.equal(sent.at(-1).body, 'decision:accept');
});

test('multi-question input is scoped to the originating sender and resolves the adapter callback', async () => {
  const dir = await makeDir();
  const sent = [];
  let answers;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async (params) => {
    answers = await params.onInput({
      id: 9,
      method: 'item/tool/requestUserInput',
      params: { questions: [{ id: 'q1', question: 'one?' }, { id: 'q2', question: 'two?' }] }
    });
    return { replyText: 'done' };
  };
  const config = baseConfig(dir, { admins: ['@admin:example.org'] });
  const bridge = new Bridge({ config, adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'ask'));
  for (let index = 0; index < 100 && !bridge.approvals.size; index++) await new Promise((resolve) => setTimeout(resolve, 10));
  const id = [...bridge.approvals.keys()][0];

  await bridge.processEvent('!r', message('$2', `/answer ${id} bad`, '@other:example.org'));
  assert.equal(bridge.approvals.size, 1);
  await bridge.processEvent('!r', message('$3', `/answer ${id} first`));
  await bridge.processEvent('!r', message('$4', `/answer ${id} second`, '@admin:example.org'));
  await bridge.queues.get('!r');

  assert.deepEqual(answers, { q1: { answers: ['first'] }, q2: { answers: ['second'] } });
  assert.equal(sent.at(-1).body, 'done');
});

test('secret input prompts are refused without contacting Matrix', async () => {
  const dir = await makeDir();
  const sent = [];
  let answers;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async (params) => {
    answers = await params.onInput({ id: 1, params: { questions: [{ id: 'secret', question: 'key?', isSecret: true }] } });
    return { replyText: 'ok' };
  };
  const bridge = new Bridge({ config: baseConfig(dir), adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'ask'));
  await bridge.queues.get('!r');
  assert.deepEqual(answers, {});
  assert.equal(bridge.approvals.size, 0);
  assert.equal(sent.at(-1).body, 'ok');
});

test('adapter errors fail closed and pause the room without replaying the event', async () => {
  const dir = await makeDir();
  const sent = [];
  let calls = 0;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { calls++; return { error: new Error('boom') }; };
  const bridge = new Bridge({ config: baseConfig(dir), adapter, token: 't', fetchImpl: matrixFetch({ sent }) });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'explode'));
  await bridge.queues.get('!r');
  await bridge.processEvent('!r', message('$2', 'again'));
  await bridge.queues.get('!r');

  assert.equal(calls, 1);
  assert.equal(bridge.blockedRooms.has('!r'), true);
  assert.match(sent.at(-1).body, /执行失败或结果未知/);
  assert.equal(bridge.state.inbox.length, 2);
  assert.equal(bridge.state.inbox[0].status, 'started');
  assert.equal(bridge.state.inbox[1].status, 'queued');
});

test('encrypted rooms stay blocked on direct transport and work through Pantalaimon', async () => {
  const dir = await makeDir();
  let directCalls = 0;
  let proxyCalls = 0;
  const directAdapter = new AgentRuntimeAdapter({ name: 'fake' });
  directAdapter.executeTurn = async () => { directCalls++; return { replyText: 'ok' }; };
  const direct = new Bridge({ config: baseConfig(dir), adapter: directAdapter, token: 't', fetchImpl: matrixFetch() });
  await direct.load();
  direct.state.rooms['!r'] = { encrypted: true };
  await direct.processEvent('!r', message('$1', 'hello'));
  assert.equal(directCalls, 0);
  assert.equal(direct.queues.size, 0);

  const proxyAdapter = new AgentRuntimeAdapter({ name: 'fake' });
  proxyAdapter.executeTurn = async () => { proxyCalls++; return { replyText: 'ok' }; };
  const proxyDir = await makeDir();
  const proxy = new Bridge({
    config: baseConfig(proxyDir, { homeserver: 'http://127.0.0.1:8009', matrix_transport: 'pantalaimon' }),
    adapter: proxyAdapter,
    token: 't',
    fetchImpl: matrixFetch()
  });
  await proxy.load();
  proxy.state.rooms['!r'] = { encrypted: true };
  await proxy.processEvent('!r', message('$1', 'hello'));
  await proxy.queues.get('!r');
  assert.equal(proxyCalls, 1);
});

test('undecryptable Pantalaimon placeholders never reach the adapter', async () => {
  const dir = await makeDir();
  let calls = 0;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { calls++; return { replyText: 'ok' }; };
  const bridge = new Bridge({
    config: baseConfig(dir, { homeserver: 'http://127.0.0.1:8009', matrix_transport: 'pantalaimon' }),
    adapter,
    token: 't',
    fetchImpl: matrixFetch()
  });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', '** Unable to decrypt: missing session key'));
  assert.equal(calls, 0);
  assert.equal(bridge.queues.size, 0);
  assert.equal(bridge.activity.at(-1).kind, 'warn');
});

test('attachments are downloaded into a private cache and forwarded to the adapter', async () => {
  const dir = await makeDir();
  let turn;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async (params) => { turn = params; return { replyText: 'ok' }; };
  const bridge = new Bridge({
    config: baseConfig(dir),
    adapter,
    token: 't',
    fetchImpl: async (url) => {
      if (url.includes('/media/download/')) return new Response(Buffer.from('test image'));
      return { ok: true, json: async () => ({ event_id: '$sent' }) };
    }
  });
  await bridge.load();
  await bridge.processEvent('!r', {
    event_id: '$image',
    type: 'm.room.message',
    sender: '@user:example.org',
    content: { msgtype: 'm.image', body: 'image.png', url: 'mxc://example.org/id' }
  });
  await bridge.queues.get('!r');
  assert.equal(turn.attachments.length, 1);
  assert.equal(turn.attachments[0].type, 'localImage');
  assert.equal(await readFile(turn.attachments[0].path, 'utf8'), 'test image');
  assert.equal((await stat(turn.attachments[0].path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(dir, 'attachments'))).mode & 0o777, 0o700);
  assert.match(turn.prompt, /本地路径/);
});

test('encrypted and oversized attachments fail closed', async () => {
  const dir = await makeDir();
  const bridge = new Bridge({
    config: baseConfig(dir),
    adapter: new AgentRuntimeAdapter(),
    token: 't',
    fetchImpl: async () => { throw new Error('must not download'); }
  });
  await bridge.load();
  await assert.rejects(() => bridge.downloadAttachment({ file: {}, url: 'mxc://example.org/id' }), /encrypted/);
  await assert.rejects(() => bridge.downloadAttachment({ url: 'mxc://example.org/id', info: { size: 51 * 1024 * 1024 } }), /50 MiB/);
});

test('adapter generated files are uploaded once and markers are stripped from text', async () => {
  const dir = await makeDir();
  const file = join(dir, 'report.pdf');
  await writeFile(file, 'pdf');
  const uploads = [];
  const sent = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => ({ replyText: 'done [SEND_FILE: report.pdf]', generatedFiles: ['report.pdf'] });
  const bridge = new Bridge({
    config: baseConfig(dir),
    adapter,
    token: 't',
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') {
        uploads.push(new URL(url).searchParams.get('filename'));
        return { ok: true, json: async () => ({ content_uri: 'mxc://example.org/1' }) };
      }
      if (options.method === 'PUT') {
        sent.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ event_id: '$sent' }) };
      }
      return { ok: true, json: async () => ({}) };
    }
  });
  await bridge.load();
  await bridge.processEvent('!r', message('$1', 'make report'));
  await bridge.queues.get('!r');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0], 'report.pdf');
  assert.equal(sent[0].msgtype, 'm.file');
  assert.equal(sent[1].body, 'done');
});

test('initial sync skips backlog and advances the checkpoint', async () => {
  const dir = await makeDir();
  let invoked = 0;
  let syncCount = 0;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { invoked++; return { replyText: 'ok' }; };
  const bridge = new Bridge({
    config: baseConfig(dir),
    adapter,
    token: 't',
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'PUT' || options.method === 'POST') return { ok: true, json: async () => ({ event_id: '$e' }) };
      syncCount++;
      return {
        ok: true,
        json: async () => ({
          next_batch: `s${syncCount}`,
          rooms: {
            join: {
              '!r': {
                state: { events: [
                  { type: 'm.room.member', state_key: '@bot:example.org', content: { membership: 'join' } },
                  { type: 'm.room.member', state_key: '@user:example.org', content: { membership: 'join' } }
                ] },
                timeline: { events: [message('$old', 'old')] }
              }
            }
          }
        })
      };
    }
  });
  await bridge.load();
  await bridge.syncOnce();
  assert.equal(invoked, 0);
  assert.equal(bridge.state.next_batch, 's1');
  await bridge.syncOnce();
  await bridge.queues.get('!r');
  assert.equal(invoked, 1);
  assert.equal(bridge.state.next_batch, 's2');
});

test('auto-join only processes invitations addressed to the bot', async () => {
  const dir = await makeDir();
  const requests = [];
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => ({ replyText: 'ok' });
  const event = (stateKey) => ({ type: 'm.room.member', state_key: stateKey, content: { membership: 'invite' } });
  const bridge = new Bridge({
    config: baseConfig(dir, { direct_rooms: [], auto_join: true }),
    adapter,
    token: 't',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, method: options.method });
      if (options.method === 'POST') return { ok: true, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          next_batch: 's1',
          rooms: { invite: {
            '!yes': { invite_state: { events: [event('@bot:example.org')] } },
            '!no': { invite_state: { events: [event('@other:example.org')] } }
          } }
        })
      };
    }
  });
  await bridge.load();
  await bridge.syncOnce();
  const joins = requests.filter((request) => request.method === 'POST');
  assert.equal(joins.length, 1);
  assert.ok(joins[0].url.includes('/join/'));
  assert.ok(joins[0].url.endsWith('!yes'));
});

test('a two-member room without an m.direct mapping is not a DM', async () => {
  const dir = await makeDir();
  let calls = 0;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { calls++; return { replyText: 'ok' }; };
  const bridge = new Bridge({
    config: baseConfig(dir, { direct_rooms: [] }),
    adapter,
    token: 't',
    fetchImpl: async (url) => {
      if (url.includes('account_data')) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ joined: { '@bot:example.org': {}, '@user:example.org': {} } }) };
    }
  });
  await bridge.load();
  await bridge.processEvent('!group', message('$1', 'hello'));
  assert.equal(calls, 0);
  assert.equal(bridge.queues.size, 0);
});

test('federation guard and admin-only workspace block before the adapter runs', async () => {
  const dir = await makeDir();
  let calls = 0;
  let external = true;
  const adapter = new AgentRuntimeAdapter({ name: 'fake' });
  adapter.executeTurn = async () => { calls++; return { replyText: 'ok' }; };
  const config = baseConfig(dir, {
    homeserver: 'https://home.example',
    user_id: '@bot:home.example',
    direct_rooms: [],
    group_reply_all: true,
    federated_room_guard: true
  });
  const bridge = new Bridge({
    config,
    adapter,
    token: 't',
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'PUT') return { ok: true, json: async () => ({ event_id: '$sent' }) };
      if (url.includes('joined_members')) {
        return {
          ok: true,
          json: async () => ({ joined: {
            '@bot:home.example': {},
            [external ? '@user:foreign.example' : '@user:home.example']: {}
          } })
        };
      }
      return { ok: true, json: async () => ({}) };
    }
  });
  await bridge.load();
  const event = (id) => message(id, 'hello', '@user:home.example');
  await bridge.processEvent('!room:home.example', event('$1'));
  assert.equal(calls, 0);
  external = false;
  config.admin_only_workspace = true;
  await bridge.processEvent('!room:home.example', event('$2'));
  assert.equal(calls, 0);
  config.admin_only_workspace = false;
  await bridge.processEvent('!room:home.example', event('$3'));
  await bridge.queues.get('!room:home.example');
  assert.equal(calls, 1);
});

test('single-instance lock rejects a second holder and releases idempotently', async () => {
  const dir = await makeDir();
  const { acquireLock } = await import('../src/instance-lock.mjs');
  const path = join(dir, 'state.json');
  const release = await acquireLock(path);
  await assert.rejects(() => acquireLock(path), { code: 'EEXIST' });
  await release();
  await release();
  const again = await acquireLock(path);
  await again();
});
