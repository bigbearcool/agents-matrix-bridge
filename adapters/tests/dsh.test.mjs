import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DshAdapter, parseDshEventStream } from '../dsh/index.mjs';
import { envWith, fixture, workspace } from './helpers.mjs';

const FAKE_DSH = fixture('fake-dsh.mjs');

test('executeTurn parses dsh JSON events, session id and generated files', async (t) => {
  const cwd = workspace(t);
  const absolute = join(cwd, 'report.md');
  mkdirSync(join(cwd, 'out'));
  const relative = 'out/chart.png';
  writeFileSync(absolute, 'report');
  writeFileSync(join(cwd, relative), 'png');

  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({
      FAKE_DSH_REPLY: `done\n[SEND_FILE: ${absolute}]\n![chart](${relative})\n<send-file path="${relative}" />`
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'inspect',
    cwd,
    roomId: '!dsh:example.org',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-new');
  assert.deepEqual(threads, ['session-new']);
  assert.match(result.replyText, /^done/);
  assert.deepEqual([...result.generatedFiles].sort(), [absolute, join(cwd, relative)].sort());
  assert.deepEqual([...adapter.sessions.get('!dsh:example.org')], ['session-new']);
});

test('executeTurn runs the documented headless invocation and forwards attachments', async (t) => {
  const cwd = workspace(t);
  const attachment = join(cwd, 'input.pdf');
  writeFileSync(attachment, 'pdf');
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_ECHO: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'summarize',
    cwd,
    model: 'deepseek-reasoner',
    effort: 'high',
    attachments: [{ type: 'file', path: attachment }]
  });

  assert.equal(result.error, null);
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.profile, 'headless');
  assert.equal(echoed.json, true);
  assert.equal(echoed.permissionMode, 'workspace-write');
  assert.equal(echoed.approvalPolicy, 'never');
  assert.equal(echoed.sessionId, '');
  assert.match(echoed.task, /^summarize/);
  assert.match(echoed.task, /\[附件\]/);
  assert.match(echoed.task, new RegExp(attachment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Headless owns model/effort through the profile row; the adapter does not
  // invent flags unless the host opts in.
  assert.equal(echoed.model, undefined);
  assert.equal(echoed.effort, undefined);
});

test('executeTurn resumes an existing session with --session-id', async (t) => {
  const cwd = workspace(t);
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_ECHO: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'continue',
    cwd,
    threadId: 'session-old',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-old');
  assert.deepEqual(threads, ['session-old']);
  assert.equal(JSON.parse(result.replyText).sessionId, 'session-old');
});

test('model and effort flags are only forwarded when explicitly enabled', async (t) => {
  const cwd = workspace(t);
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_ECHO: '1' }),
    supportsModelFlag: true,
    supportsEffortFlag: true,
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'go',
    cwd,
    model: 'deepseek-reasoner',
    effort: 'high'
  });
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.model, 'deepseek-reasoner');
  assert.equal(echoed.effort, 'high');
});

test('event parsing tolerates split lines, ignores diagnostics and falls back to text events', async (t) => {
  const cwd = workspace(t);
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({
      FAKE_DSH_ECHO: '1',
      FAKE_DSH_NOISE: '1',
      FAKE_DSH_CHUNKED: '1',
      FAKE_DSH_EMPTY_FINAL: '1',
      FAKE_DSH_SPLIT_TEXT: '1'
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({ prompt: 'chunked', cwd });
  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-new');
  // final.text is empty, so the committed text events carry the answer.
  assert.match(result.replyText, /chunked/);
  assert.ok(result.replyText.includes('\n'));
});

test('parseDshEventStream summarizes session, thinking, text and final events', () => {
  const stream = [
    JSON.stringify({ type: 'session', sessionId: 'session-direct', cwd: '/tmp/work' }),
    JSON.stringify({ type: 'status', phase: 'turn_start', turn: 1 }),
    JSON.stringify({ type: 'thinking', text: 'weighing' }),
    JSON.stringify({ type: 'text', text: 'partial answer' }),
    '{not json',
    JSON.stringify({ type: 'final', sessionId: 'session-direct', reason: { kind: 'completed' }, text: 'final answer' })
  ].join('\n');

  const parsed = parseDshEventStream(stream);
  assert.equal(parsed.sessionId, 'session-direct');
  assert.equal(parsed.replyText, 'final answer');
  assert.equal(parsed.final.reason.kind, 'completed');
  assert.equal(parsed.events.length, 5);
  assert.equal(parsed.ignoredLines, 1);

  const fallback = parseDshEventStream([
    JSON.stringify({ type: 'session', sessionId: 'session-two' }),
    JSON.stringify({ type: 'text', text: 'first part' }),
    JSON.stringify({ type: 'text', text: 'second part' }),
    JSON.stringify({ type: 'final', sessionId: 'session-two', reason: { kind: 'completed' }, text: '' })
  ].join('\n'));
  assert.equal(fallback.replyText, 'first part\nsecond part');
});

test('a missing resumed session retries once with a fresh session', async (t) => {
  const cwd = workspace(t);
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_RESUME_FAIL: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'resume',
    cwd,
    threadId: 'session-missing',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-new');
  assert.deepEqual(threads, ['session-new']);
});

test('dsh failures and timeouts are returned through result.error', async (t) => {
  const cwd = workspace(t);

  const failing = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_FAIL: '1', FAKE_DSH_STDERR: 'authentication required', FAKE_DSH_EXIT_CODE: '7' }),
    turnTimeoutMs: 5000
  });
  t.after(() => failing.close());
  const failed = await failing.executeTurn({ prompt: 'x', cwd });
  assert.ok(failed.error instanceof Error);
  assert.match(failed.error.message, /authentication required/);
  assert.equal(failed.error.code, 7);

  const hanging = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_HANG: '1' }),
    turnTimeoutMs: 250
  });
  t.after(() => hanging.close());
  const timedOut = await hanging.executeTurn({ prompt: 'x', cwd });
  assert.ok(timedOut.error instanceof Error);
  assert.equal(timedOut.error.code, 'ETIMEDOUT');
  assert.match(timedOut.error.message, /timed out/);
});

test('a failed turn reason on exit zero is reported as an error', async (t) => {
  const cwd = workspace(t);
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({
      FAKE_DSH_SOFT_ERROR: '1',
      FAKE_DSH_SOFT_ERROR_MESSAGE: 'provider rejected the request'
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({ prompt: 'x', cwd });
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /provider rejected the request/);
  assert.equal(result.error.code, 'TURN_FAILED');
  assert.match(result.replyText, /fake dsh reply/);
});

test('listAvailableModels returns the DSH catalog', async (t) => {
  const adapter = new DshAdapter({ defaultCliPath: FAKE_DSH });
  t.after(() => adapter.close());

  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models.map((model) => model.id), ['deepseek-chat', 'deepseek-reasoner']);
  assert.deepEqual(catalog.efforts, []);

  const explicit = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    models: [{ id: 'room-model', name: 'Room Model', description: 'explicit' }],
    efforts: ['low', 'high']
  });
  t.after(() => explicit.close());
  assert.deepEqual(await explicit.listAvailableModels(), {
    models: [{ id: 'room-model', name: 'Room Model', description: 'explicit' }],
    efforts: ['low', 'high']
  });
});

test('resetSession forgets the room bookkeeping and notifies the host', async (t) => {
  const cwd = workspace(t);
  const resets = [];
  const adapter = new DshAdapter({
    defaultCliPath: FAKE_DSH,
    env: envWith({ FAKE_DSH_ECHO: '1' }),
    turnTimeoutMs: 5000,
    onReset: async (roomId, threadId) => resets.push([roomId, threadId])
  });
  t.after(() => adapter.close());

  await adapter.executeTurn({ prompt: 'hi', cwd, roomId: '!reset:example.org' });
  assert.equal(adapter.sessions.get('!reset:example.org').size, 1);

  await adapter.resetSession('!reset:example.org', 'session-new');
  assert.equal(adapter.sessions.has('!reset:example.org'), false);
  assert.deepEqual(resets, [['!reset:example.org', 'session-new']]);
});
