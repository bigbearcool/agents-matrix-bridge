import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeAdapter, scanGeneratedFiles } from '../claude/index.mjs';
import { AgentRuntimeAdapter } from '../../packages/matrix-core/src/adapter.mjs';
import { envWith, fixture, workspace } from './helpers.mjs';

const FAKE_CLAUDE = fixture('fake-claude.mjs');

function readArgvLog(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('executeTurn parses claude JSON, session id and generated files', async (t) => {
  const cwd = workspace(t);
  const absolute = join(cwd, 'report.md');
  mkdirSync(join(cwd, 'out'));
  const relative = 'out/chart.png';
  writeFileSync(absolute, 'report');
  writeFileSync(join(cwd, relative), 'png');

  const adapter = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({
      FAKE_CLAUDE_REPLY: `done\n[SEND_FILE: ${absolute}]\n![chart](${relative})`
    }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const threads = [];
  const result = await adapter.executeTurn({
    prompt: 'inspect',
    cwd,
    roomId: '!claude:example.org',
    onThread: async (id) => threads.push(id)
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-new');
  assert.deepEqual(threads, ['session-new']);
  assert.deepEqual([...result.generatedFiles].sort(), [absolute, join(cwd, relative)].sort());
  assert.deepEqual([...adapter.sessions.get('!claude:example.org')], ['session-new']);
  assert.ok(adapter instanceof AgentRuntimeAdapter);
  assert.equal(adapter.name, 'claude');
});

test('executeTurn forwards resume, model, effort and attachments', async (t) => {
  const cwd = workspace(t);
  const attachment = join(cwd, 'input.pdf');
  writeFileSync(attachment, 'pdf');
  const adapter = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({ FAKE_CLAUDE_ECHO: '1' }),
    turnTimeoutMs: 5000
  });
  t.after(() => adapter.close());

  const result = await adapter.executeTurn({
    prompt: 'summarize',
    cwd,
    model: 'claude-3-7-sonnet',
    effort: 'high',
    threadId: 'old-session',
    attachments: [{ type: 'file', path: attachment }]
  });

  assert.equal(result.error, null);
  assert.equal(result.threadId, 'session-existing');
  const echoed = JSON.parse(result.replyText);
  assert.equal(echoed.print, true);
  assert.equal(echoed.outputFormat, 'json');
  assert.equal(echoed.permissionMode, 'bypassPermissions');
  assert.equal(echoed.resume, 'old-session');
  assert.equal(echoed.model, 'claude-3-7-sonnet');
  assert.equal(echoed.effort, 'high');
  assert.match(echoed.prompt, /^summarize/);
  assert.ok(echoed.prompt.includes('[附件]'));
  assert.ok(echoed.prompt.includes(attachment));
});

test('an expired claude session retries once with a clean turn', async (t) => {
  const cwd = workspace(t);
  const logPath = join(cwd, 'argv.log');
  const adapter = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({ FAKE_CLAUDE_RESUME_FAIL: '1', FAKE_CLAUDE_ARGV_LOG: logPath }),
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
  assert.equal(result.threadId, 'session-new');
  assert.deepEqual(threads, ['session-new']);

  const invocations = readArgvLog(logPath);
  assert.equal(invocations.length, 2);
  const firstResume = invocations[0].indexOf('--resume');
  assert.ok(firstResume >= 0);
  assert.equal(invocations[0][firstResume + 1], 'old-session');
  assert.equal(invocations[1].includes('--resume'), false);
});

test('claude failures, error payloads and timeouts surface through result.error', async (t) => {
  const cwd = workspace(t);

  const failing = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({ FAKE_CLAUDE_FAIL: '1', FAKE_CLAUDE_STDERR: 'login required', FAKE_CLAUDE_EXIT_CODE: '6' }),
    turnTimeoutMs: 5000
  });
  t.after(() => failing.close());
  const failed = await failing.executeTurn({ prompt: 'x', cwd });
  assert.ok(failed.error instanceof Error);
  assert.match(failed.error.message, /login required/);
  assert.equal(failed.error.code, 6);
  assert.equal(failed.threadId, '');

  const reported = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({ FAKE_CLAUDE_IS_ERROR: '1', FAKE_CLAUDE_ERROR_MESSAGE: 'permission denied' }),
    turnTimeoutMs: 5000
  });
  t.after(() => reported.close());
  const errored = await reported.executeTurn({ prompt: 'x', cwd });
  assert.ok(errored.error instanceof Error);
  assert.match(errored.error.message, /permission denied/);
  assert.equal(errored.error.code, 'error_during_execution');

  const hanging = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    env: envWith({ FAKE_CLAUDE_HANG: '1' }),
    turnTimeoutMs: 250
  });
  t.after(() => hanging.close());
  const timedOut = await hanging.executeTurn({ prompt: 'x', cwd });
  assert.ok(timedOut.error instanceof Error);
  assert.equal(timedOut.error.code, 'ETIMEDOUT');
  assert.match(timedOut.error.message, /timed out/);
});

test('empty prompts and missing workspaces fail without spawning claude', async (t) => {
  const adapter = new ClaudeAdapter({ defaultCliPath: FAKE_CLAUDE });
  t.after(() => adapter.close());

  const empty = await adapter.executeTurn({ prompt: '   ', cwd: process.cwd() });
  assert.ok(empty.error instanceof Error);
  assert.match(empty.error.message, /non-empty prompt/);

  const missing = await adapter.executeTurn({ prompt: 'go', cwd: join(process.cwd(), 'does-not-exist-claude') });
  assert.ok(missing.error instanceof Error);
  assert.match(missing.error.message, /does not exist/);
});

test('listAvailableModels returns the documented Claude catalog', async (t) => {
  const adapter = new ClaudeAdapter({ defaultCliPath: FAKE_CLAUDE });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models.map((model) => model.id), [
    'claude-3-7-sonnet',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-opus'
  ]);
  assert.deepEqual(catalog.models.map((model) => model.name), [
    'Claude 3.7 Sonnet',
    'Claude 3.5 Sonnet',
    'Claude 3.5 Haiku',
    'Claude Opus'
  ]);
  assert.deepEqual(catalog.efforts, ['low', 'medium', 'high', 'max']);
});

test('explicit model and effort options override the Claude fallback', async (t) => {
  const adapter = new ClaudeAdapter({
    defaultCliPath: FAKE_CLAUDE,
    models: ['room-a', { id: 'room-b', name: 'Room B', description: 'explicit' }],
    efforts: ['low', 'max']
  });
  t.after(() => adapter.close());
  const catalog = await adapter.listAvailableModels();
  assert.deepEqual(catalog.models, [
    { id: 'room-a', name: 'room-a', description: '' },
    { id: 'room-b', name: 'Room B', description: 'explicit' }
  ]);
  assert.deepEqual(catalog.efforts, ['low', 'max']);
});

test('CLI path resolution and resetSession bookkeeping', async (t) => {
  const fallback = new ClaudeAdapter();
  t.after(() => fallback.close());
  assert.match(fallback.defaultCliPath, /claude$/);

  const explicit = new ClaudeAdapter({ cliPath: '/tmp/claude-test-bin' });
  t.after(() => explicit.close());
  assert.equal(explicit.defaultCliPath, '/tmp/claude-test-bin');

  explicit.sessions.set('!room:example.org', new Set(['session-a', 'session-b']));
  await explicit.resetSession('!room:example.org', 'session-a');
  assert.deepEqual([...explicit.sessions.get('!room:example.org')], ['session-b']);
  await explicit.resetSession('!room:example.org');
  assert.equal(explicit.sessions.has('!room:example.org'), false);
});

test('scanGeneratedFiles ignores remote and missing artifacts', (t) => {
  const cwd = workspace(t);
  const generated = scanGeneratedFiles(
    '[SEND_FILE: missing.png]\n![web](https://example.org/a.png)\n<img src="x">',
    cwd
  );
  assert.deepEqual(generated, []);
});
