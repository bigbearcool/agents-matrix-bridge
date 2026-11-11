import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleCommand, parseCommand, readModelCatalog } from '../src/commands.mjs';

const adapter = {
  name: 'fake',
  async listAvailableModels() {
    return {
      models: [
        { id: 'fast', name: 'Fast', description: 'quick' },
        { id: 'deep', name: 'Deep' }
      ],
      efforts: ['low', 'high']
    };
  }
};

async function makeConfig() {
  const dir = await mkdtemp(join(tmpdir(), 'matrix-core-commands-'));
  await mkdir(join(dir, 'work'), { recursive: true });
  return {
    dir,
    config: {
      cwd: dir,
      user_id: '@bot:example.org',
      admins: ['@admin:example.org']
    }
  };
}

test('non-command prose and unknown commands are ignored', async () => {
  const { config } = await makeConfig();
  const room = {};
  assert.equal(await handleCommand({ body: '请解释 /new 的用途', room, config, sender: '@admin:example.org' }), null);
  assert.equal(await handleCommand({ body: 'hello', room, config, sender: '@admin:example.org' }), null);
  assert.deepEqual(room, {});
  assert.equal(parseCommand('hello', config), null);
  assert.deepEqual(parseCommand('@bot:example.org /model fast', config), {
    name: 'model', arg: 'fast', text: '/model fast'
  });
});

test('help and status describe the active adapter and room', async () => {
  const { config } = await makeConfig();
  const room = { workspace: config.cwd, policy: 'all', model: 'fast', effort: 'high' };
  const help = await handleCommand({ body: '/help', room, config, sender: '@admin:example.org', adapter });
  assert.match(help, /当前 Agent：fake/);
  assert.match(help, /\/workspace/);
  assert.match(help, /\/model/);
  const status = await handleCommand({ body: '/status', room, config, sender: '@admin:example.org', adapter });
  assert.match(status, /Agent：fake/);
  assert.match(status, /策略：all/);
  assert.match(status, /模型：fast/);
  assert.match(status, /思考深度：high/);
});

test('policy changes require an administrator and a known value', async () => {
  const { config } = await makeConfig();
  const room = {};
  assert.equal(await handleCommand({ body: '/policy', room, config, sender: '@admin:example.org' }), '当前策略：default');
  assert.match(await handleCommand({ body: '/policy all', room, config, sender: '@user:example.org' }), /只有管理员/);
  assert.match(await handleCommand({ body: '/policy bogus', room, config, sender: '@admin:example.org' }), /可选策略/);
  assert.equal(await handleCommand({ body: '/policy all', room, config, sender: '@admin:example.org' }), '房间策略：all');
  assert.equal(room.policy, 'all');
});

test('model and effort commands validate, persist room/global defaults and list adapter catalog', async () => {
  const { config } = await makeConfig();
  const room = {};
  const settings = {};
  const run = (body, sender = '@admin:example.org') => handleCommand({ body, room, config, sender, settings, adapter });

  assert.match(await run('/model list'), /可选模型：/);
  assert.match(await run('/model list'), /• fast：quick/);
  assert.match(await run('/model list'), /• deep（Deep）/);
  assert.match(await run('/effort list'), /• low/);
  assert.match(await run('/effort list'), /• high/);

  assert.match(await run('/model fast', '@user:example.org'), /只有管理员/);
  assert.equal(await run('/model fast'), '房间 model：fast');
  assert.equal(room.model, 'fast');
  assert.equal(await run('/effort high'), '房间 effort：high');
  assert.equal(room.effort, 'high');
  assert.equal(await run('/model global deep'), '全局 model：deep');
  assert.equal(settings.default_model, 'deep');
  assert.equal(await run('/effort global low'), '全局 effort：low');
  assert.equal(settings.default_effort, 'low');
  assert.match(await run('/effort extreme'), /无效的思考深度/);
  assert.equal(await run('/model default'), '房间 model：default');
  assert.equal(room.model, '');
  assert.equal(await run('/thinking'), '当前effort：high\n可选思考深度：\n• low\n• high');
});

test('workspace binding, listing and unbinding reset sessions', async () => {
  const { dir, config } = await makeConfig();
  const room = { thread_id: 'old', thread_sessions: { $r: 'child' }, sessions: { s1: {} }, active_session: 's1' };
  const run = (body, sender = '@admin:example.org') => handleCommand({ body, room, config, sender });

  assert.match(await run('/workspace list'), /目录：/);
  assert.match(await run(`/workspace list work`), /目录：.*work/);
  assert.equal(await run('/workspace', '@user:example.org'), `工作目录：${config.cwd}`);
  assert.match(await run(`/workspace bind work`, '@user:example.org'), /只有管理员/);
  assert.equal(await run('/workspace bind work'), `工作目录：${join(dir, 'work')}`);
  assert.equal(room.thread_id, '');
  assert.deepEqual(room.sessions, {});
  assert.equal(await run('/workspace unbind'), '已解除工作区绑定。');
  assert.equal(room.workspace, '');
  assert.match(await run('/workspace bind missing'), /目录不存在/);
});

test('session commands list, create and switch isolated contexts', async () => {
  const { config } = await makeConfig();
  const room = { thread_id: 'main', thread_sessions: { $root: 'child' } };
  const run = (body, sender = '@admin:example.org') => handleCommand({ body, room, config, sender });

  assert.equal(await run('/new first'), '已创建会话 s2（first）。');
  assert.equal(room.active_session, 's2');
  assert.equal(room.thread_id, '');
  room.thread_sessions.$other = 'child2';
  assert.match(await run('/current'), /当前会话：s2/);
  assert.match(await run('/list'), /\* s2 first/);
  assert.equal(await run('/switch s1'), '已切换到会话 s1。');
  assert.equal(room.thread_sessions.$root, 'child');
  assert.equal(await run('/switch s2'), '已切换到会话 s2。');
  assert.equal(room.thread_sessions.$other, 'child2');
  assert.match(await run('/switch s9'), /会话不存在/);
});

test('thread and room reset honour administrator/direct-chat permissions', async () => {
  const { config } = await makeConfig();
  const threadRoom = { thread_sessions: { $root: 'child' } };
  assert.equal(
    await handleCommand({ body: '/new', room: threadRoom, config, sender: '@admin:example.org', thread: '$root' }),
    '当前线程会话已重置。'
  );
  assert.deepEqual(threadRoom.thread_sessions, {});

  const room = { thread_id: 't', sessions: { s1: {} }, active_session: 's1' };
  assert.match(await handleCommand({ body: '/reset', room, config, sender: '@user:example.org' }), /群聊中只有管理员/);
  assert.equal(await handleCommand({ body: '/reset', room, config, sender: '@user:example.org', isDirect: true }), '当前房间会话已重置。');
  assert.equal(room.thread_id, '');
});

test('/dir remains an administrator-only alias for workspace changes', async () => {
  const { dir, config } = await makeConfig();
  const room = { workspace: config.cwd };
  assert.match(await handleCommand({ body: '/dir work', room, config, sender: '@user:example.org' }), /只有管理员/);
  assert.equal(await handleCommand({ body: '/dir work', room, config, sender: '@admin:example.org' }), `工作目录：${join(dir, 'work')}`);
  assert.equal(await handleCommand({ body: '/dir reset', room, config, sender: '@admin:example.org' }), `工作目录：${config.cwd}`);
  assert.equal(await handleCommand({ body: '/dir', room, config, sender: '@admin:example.org' }), `当前工作目录：${config.cwd}`);
});

test('model catalog helper tolerates missing or failing adapters', async () => {
  assert.deepEqual(await readModelCatalog(null), { models: [], efforts: [] });
  assert.deepEqual(await readModelCatalog({ listAvailableModels: async () => { throw new Error('boom'); } }), { models: [], efforts: [] });
  assert.deepEqual(await readModelCatalog(adapter), {
    models: [
      { id: 'fast', name: 'Fast', description: 'quick' },
      { id: 'deep', name: 'Deep', description: '' }
    ],
    efforts: ['low', 'high']
  });
});
