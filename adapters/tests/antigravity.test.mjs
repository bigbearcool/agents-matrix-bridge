import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AntigravityAdapter } from '../antigravity/index.mjs';
import { envWith, fixture, workspace } from './helpers.mjs';

const FAKE_AGY = fixture('fake-agy.mjs');

test('executeTurn parses agy JSON, thread id and generated files', async (t) => {
  const cwd = workspace(t);
  const absolute = join(cwd, 'absolute.txt');
  mkdirSync(join(cwd, 'out'));
  const relative = 'out/relative.txt';
  writeFileSync(absolute, 'a');
  writeFileSync(join(cwd, relative), 'r');

  const adapter = new AntigravityAdapter({
    defaultCliPath: FAKE_AGY,
    env: envWith({
      FAKE_AGY_REPLY: `done\n<send-file path="${absolute}" />\n[SEND_FILE: ${relative}]`
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'inspect',
    cwd,
    roomId: '!agy:example.org',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'conv-new');
  assert.deepEqual(threads, ['conv-new']);
  assert.deepEqual([...result.generatedFiles].sort(), [absolute, join(cwd, relative)].sort());
  assert.deepEqual([...adapter.sessions.get('!agy:example.org')], ['conv-new']);
});

test('executeTurn forwards model, effort and resumes conversations', async (t) => {
  const cwd = workspace(t);
  const attachment = join(cwd, 'image.png');
  writeFileSync(attachment, 'png');
  const adapter = new AntigravityAdapter({
    defaultCliPath: FAKE_AGY,
    env: envWith({ FAKE_AGY_ECHO: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'look at this',
    cwd,
    model: 'gemini-test-high',
    effort: 'xhigh',
    threadId: 'existing-session',
    attachments: [{ type: 'localImage', path: attachment }]
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'conv-existing');
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.model, 'gemini-test-high');
  assert.equal(echoed.effort, 'xhigh');
  assert.equal(echoed.conversation, 'existing-session');
  assert.match(echoed.prompt, /look at this/);
  assert.match(echoed.prompt, /\[附件\]/);
  assert.match(echoed.prompt, new RegExp(attachment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('an expired agy conversation retries once with a fresh session', async (t) => {
  const cwd = workspace(t);
  const adapter = new AntigravityAdapter({
    defaultCliPath: FAKE_AGY,
    env: envWith({ FAKE_AGY_RESUME_FAIL: '1' }),
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
  assert.equal(result.threadId, 'conv-new');
  assert.deepEqual(threads, ['conv-new']);
});

test('agy failures and timeouts are returned through result.error', async (t) => {
  const cwd = workspace(t);

  const failing = new AntigravityAdapter({
    defaultCliPath: FAKE_AGY,
    env: envWith({ FAKE_AGY_FAIL: '1', FAKE_AGY_STDERR: 'authenticate first' }),
    turnTimeoutMs: 5000
  });
  t.after(() => failing.close());
  const failed = await failing.executeTurn({ prompt: 'x', cwd });
  assert.ok(failed.error instanceof Error);
  assert.match(failed.error.message, /authenticate first/);
  assert.equal(failed.error.code, 5);

  const hanging = new AntigravityAdapter({
    defaultCliPath: FAKE_AGY,
    env: envWith({ FAKE_AGY_HANG: '1' }),
    turnTimeoutMs: 250
  });
  t.after(() => hanging.close());
  const timedOut = await hanging.executeTurn({ prompt: 'x', cwd });
  assert.ok(timedOut.error instanceof Error);
  assert.equal(timedOut.error.code, 'ETIMEDOUT');
  assert.match(timedOut.error.message, /timed out/);
});

test('listAvailableModels parses agy models and falls back cleanly', async (t) => {
  const adapter = new AntigravityAdapter({ defaultCliPath: FAKE_AGY });
  t.after(() => adapter.close());

  const first = await adapter.listAvailableModels();
  const second = await adapter.listAvailableModels();
  assert.equal(first, second);
  assert.deepEqual(first.models.map((model) => model.id), ['fixture-agy-low', 'fixture-agy-high']);
  assert.deepEqual(first.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);

  const fallback = new AntigravityAdapter({
    defaultCliPath: '/definitely/missing/agy-binary',
    modelTimeoutMs: 500
  });
  t.after(() => fallback.close());
  const catalog = await fallback.listAvailableModels();
  assert.ok(catalog.models.length > 0);
  assert.ok(catalog.efforts.includes('max'));
});

test('explicit model options override agy discovery', async (t) => {
  const adapter = new AntigravityAdapter({
    defaultCliPath: '/definitely/missing/agy-binary',
    models: [{ id: 'agy-room-model', name: 'Agy Room Model' }],
    efforts: ['low', 'high']
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models, [{ id: 'agy-room-model', name: 'Agy Room Model', description: '' }]);
  assert.deepEqual(catalog.efforts, ['low', 'high']);
});
