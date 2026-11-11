import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodexAdapter } from '../codex/index.mjs';
import { CodexClient } from '../codex/client.mjs';
import { envWith, fixture, workspace } from './helpers.mjs';

const FAKE_CODEX = fixture('fake-codex.mjs');

test('executeTurn drives a Codex turn with approvals, user input and thread hook', async (t) => {
  const cwd = workspace(t);
  const sentFile = join(cwd, 'artifact.txt');
  const changedFile = join(cwd, 'changed.txt');
  writeFileSync(sentFile, 'sent');
  writeFileSync(changedFile, 'changed');

  const adapter = new CodexAdapter({
    defaultCliPath: FAKE_CODEX,
    env: envWith({
      FAKE_REPLY: `finished\n<send-file path="${sentFile}" />`,
      FAKE_CHANGED_FILE: changedFile
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const approvals = [];
  const inputs = [];
  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'please inspect the repo',
    cwd,
    model: 'fake-codex-model',
    effort: 'high',
    threadId: '',
    roomId: '!room:example.org',
    onThread: async (id) => threads.push(id),
    onApproval: async (request) => {
      approvals.push(request);
      return 'accept';
    },
    onInput: async (request) => {
      inputs.push(request);
      return { q1: { answers: ['yes'] } };
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.replyText, `finished\n<send-file path="${sentFile}" />`);
  assert.equal(result.threadId, 'thread-new');
  assert.deepEqual(threads, ['thread-new']);
  assert.deepEqual(
    [...result.generatedFiles].sort(),
    [sentFile, changedFile].sort()
  );

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].method, 'item/commandExecution/requestApproval');
  assert.equal(approvals[0].params.command, 'echo test');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].method, 'item/tool/requestUserInput');
  assert.equal(inputs[0].params.questions[0].id, 'q1');

  assert.deepEqual([...adapter.sessions.get('!room:example.org')], ['thread-new']);
});

test('a Codex turn resumes a thread and auto-declines when no callbacks are supplied', async (t) => {
  const cwd = workspace(t);
  const adapter = new CodexAdapter({
    defaultCliPath: FAKE_CODEX,
    env: envWith({ FAKE_ECHO_DECISION: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'continue',
    cwd,
    threadId: 'thread-existing',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'thread-existing');
  assert.deepEqual(threads, ['thread-existing']);
  assert.equal(result.replyText, 'decision=decline;answers={}');
});

test('a failed Codex turn is surfaced through result.error', async (t) => {
  const cwd = workspace(t);
  const adapter = new CodexAdapter({
    defaultCliPath: FAKE_CODEX,
    env: envWith({ FAKE_FAIL_STATUS: 'failed' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({ prompt: 'fail please', cwd });
  assert.equal(result.replyText, '');
  assert.deepEqual(result.generatedFiles, []);
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /Codex turn failed/);
});

test('a Codex turn timeout is reported as ETIMEDOUT', async (t) => {
  const cwd = workspace(t);
  const adapter = new CodexAdapter({
    defaultCliPath: FAKE_CODEX,
    env: envWith({ FAKE_HANG_TURN: '1' }),
    turnTimeoutMs: 300
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({ prompt: 'hang', cwd });
  assert.ok(result.error instanceof Error);
  assert.equal(result.error.code, 'ETIMEDOUT');
  assert.match(result.error.message, /timed out/);
});

test('an app-server exit during a turn is surfaced and the client can respawn', async (t) => {
  const cwd = workspace(t);
  const adapter = new CodexAdapter({
    defaultCliPath: FAKE_CODEX,
    env: envWith({ FAKE_EXIT_ON_TURN: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({ prompt: 'exit', cwd });
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /exited/);
  assert.equal(adapter.client, null);
});

test('CodexClient supports the legacy (command, env) constructor signature', async (t) => {
  const cwd = workspace(t);
  const client = new CodexClient(FAKE_CODEX, envWith({
    FAKE_NO_REQUESTS: '1',
    FAKE_REPLY: 'legacy-env reply'
  }));
  t.after(() => client.close());

  const result = await client.turn({ cwd, text: 'hello' });
  assert.equal(result.text, 'legacy-env reply');
  assert.equal(result.threadId, 'thread-new');
});

test('listAvailableModels parses the Codex catalog and caches it', async (t) => {
  const adapter = new CodexAdapter({ defaultCliPath: FAKE_CODEX });
  t.after(() => adapter.close());

  const first = await adapter.listAvailableModels();
  const second = await adapter.listAvailableModels();
  assert.equal(first, second);
  assert.deepEqual(first.models.map((model) => model.id), ['fake-codex-model', 'fake-codex-fast']);

  adapter.clearModelCache();
  const third = await adapter.listAvailableModels();
  assert.notEqual(third, first);
  assert.deepEqual(third.models.map((model) => model.id), ['fake-codex-model', 'fake-codex-fast']);
});

test('listAvailableModels falls back when the CLI is unavailable', async (t) => {
  const adapter = new CodexAdapter({
    defaultCliPath: '/definitely/missing/codex-binary',
    modelTimeoutMs: 500
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.ok(catalog.models.length > 0);
  assert.ok(catalog.efforts.includes('high'));
});

test('explicit model options override catalog discovery', async (t) => {
  const adapter = new CodexAdapter({
    defaultCliPath: '/definitely/missing/codex-binary',
    models: [{ id: 'room-model', name: 'Room Model', description: 'explicit' }],
    efforts: ['low', 'ultra']
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models, [{ id: 'room-model', name: 'Room Model', description: 'explicit' }]);
  assert.deepEqual(catalog.efforts, ['low', 'ultra']);
});
