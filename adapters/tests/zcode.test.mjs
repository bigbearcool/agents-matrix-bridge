import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZCodeAdapter } from '../zcode/index.mjs';
import { envWith, fixture, workspace } from './helpers.mjs';

const FAKE_ZCODE = fixture('fake-zcode.mjs');

test('executeTurn parses zcode JSON, session id and generated files', async (t) => {
  const cwd = workspace(t);
  const absolute = join(cwd, 'report.md');
  mkdirSync(join(cwd, 'out'));
  const relative = 'out/chart.png';
  writeFileSync(absolute, 'report');
  writeFileSync(join(cwd, relative), 'png');

  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({
      FAKE_ZCODE_REPLY: `done\n<send-file path="${absolute}" />\n![chart](${relative})`
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'inspect',
    cwd,
    roomId: '!zcode:example.org',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'sess-new');
  assert.deepEqual(threads, ['sess-new']);
  assert.deepEqual([...result.generatedFiles].sort(), [absolute, join(cwd, relative)].sort());
  assert.deepEqual([...adapter.sessions.get('!zcode:example.org')], ['sess-new']);
});

test('executeTurn resumes sessions and forwards attachments', async (t) => {
  const cwd = workspace(t);
  const attachment = join(cwd, 'input.pdf');
  writeFileSync(attachment, 'pdf');
  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({ FAKE_ZCODE_ECHO: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'summarize',
    cwd,
    threadId: 'old-session',
    attachments: [{ type: 'file', path: attachment }]
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'sess-existing');
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.prompt, 'summarize');
  assert.equal(echoed.resume, 'old-session');
  assert.deepEqual(echoed.attachments, [attachment]);
  // ZCode has no per-turn model/effort flags by default.
  assert.equal(echoed.model, undefined);
  assert.equal(echoed.effort, undefined);
});

test('model and effort flags are only forwarded when explicitly enabled', async (t) => {
  const cwd = workspace(t);
  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({ FAKE_ZCODE_ECHO: '1' }),
    supportsModelFlag: true,
    supportsEffortFlag: true,
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'go',
    cwd,
    model: 'zai/glm-5',
    effort: 'high'
  });
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.model, 'zai/glm-5');
  assert.equal(echoed.effort, 'high');
});

test('an expired zcode session retries once with a fresh session', async (t) => {
  const cwd = workspace(t);
  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({ FAKE_ZCODE_RESUME_FAIL: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'resume',
    cwd,
    threadId: 'old-session',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'sess-new');
  assert.deepEqual(threads, ['sess-new']);
});

test('zcode failures and timeouts are returned through result.error', async (t) => {
  const cwd = workspace(t);

  const failing = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({ FAKE_ZCODE_FAIL: '1', FAKE_ZCODE_STDERR: 'login required' }),
    turnTimeoutMs: 5000
  });
  t.after(() => failing.close());
  const failed = await failing.executeTurn({ prompt: 'x', cwd });
  assert.ok(failed.error instanceof Error);
  assert.match(failed.error.message, /login required/);
  assert.equal(failed.error.code, 6);

  const hanging = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    env: envWith({ FAKE_ZCODE_HANG: '1' }),
    turnTimeoutMs: 250
  });
  t.after(() => hanging.close());
  const timedOut = await hanging.executeTurn({ prompt: 'x', cwd });
  assert.ok(timedOut.error instanceof Error);
  assert.equal(timedOut.error.code, 'ETIMEDOUT');
  assert.match(timedOut.error.message, /timed out/);
});

test('listAvailableModels returns the static ZCode catalog by default', async (t) => {
  const adapter = new ZCodeAdapter({ defaultCliPath: FAKE_ZCODE });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.ok(catalog.models.some((model) => model.id === 'zai/glm-5'));
  assert.deepEqual(catalog.efforts, []);
});

test('listAvailableModels can parse an explicit models command', async (t) => {
  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    modelArgs: ['models']
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models, [
    { id: 'fixture/zcode-one', name: 'Fixture ZCode One', description: 'first' },
    { id: 'fixture/zcode-two', name: 'Fixture ZCode Two', description: 'second' }
  ]);
  assert.deepEqual(catalog.efforts, ['low', 'high']);
});

test('explicit model options override the ZCode fallback', async (t) => {
  const adapter = new ZCodeAdapter({
    defaultCliPath: FAKE_ZCODE,
    models: ['room-a', { id: 'room-b', name: 'Room B', description: 'explicit' }],
    efforts: ['low']
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models, [
    { id: 'room-a', name: 'room-a', description: '' },
    { id: 'room-b', name: 'Room B', description: 'explicit' }
  ]);
  assert.deepEqual(catalog.efforts, ['low']);
});
