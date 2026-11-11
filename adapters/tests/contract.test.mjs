import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRuntimeAdapter,
  assertAgentRuntimeAdapter,
  isAgentRuntimeAdapter
} from '../../packages/matrix-core/src/adapter.mjs';
import {
  ADAPTER_NAMES,
  AntigravityAdapter,
  CodexAdapter,
  ClaudeAdapter,
  DshAdapter,
  ZCodeAdapter
} from '../index.mjs';
import { scanGeneratedFiles as scanCodex } from '../codex/index.mjs';
import { scanGeneratedFiles as scanAgy } from '../antigravity/index.mjs';
import { scanGeneratedFiles as scanZcode } from '../zcode/index.mjs';
import { scanGeneratedFiles as scanClaude } from '../claude/index.mjs';
import { scanGeneratedFiles as scanDsh } from '../dsh/index.mjs';
import { fixture, workspace } from './helpers.mjs';

const CASES = [
  { name: 'codex', Ctor: CodexAdapter, fixture: 'fake-codex.mjs' },
  { name: 'antigravity', Ctor: AntigravityAdapter, fixture: 'fake-agy.mjs' },
  { name: 'zcode', Ctor: ZCodeAdapter, fixture: 'fake-zcode.mjs' },
  { name: 'claude', Ctor: ClaudeAdapter, fixture: 'fake-claude.mjs' },
  { name: 'dsh', Ctor: DshAdapter, fixture: 'fake-dsh.mjs' }
];

test('all adapters extend AgentRuntimeAdapter and expose the contract', async (t) => {
  assert.deepEqual(ADAPTER_NAMES, ['codex', 'antigravity', 'zcode', 'claude', 'dsh']);
  for (const entry of CASES) {
    const cliPath = fixture(entry.fixture);
    const adapter = new entry.Ctor({ defaultCliPath: cliPath });
    t.after(() => adapter.close?.());

    assert.ok(adapter instanceof AgentRuntimeAdapter, `${entry.name} must extend the base class`);
    assert.equal(adapter.name, entry.name);
    assert.equal(adapter.defaultCliPath, cliPath);
    assert.equal(isAgentRuntimeAdapter(adapter), true);
    assert.equal(assertAgentRuntimeAdapter(adapter), adapter);

    const empty = await adapter.executeTurn({ prompt: '', cwd: process.cwd() });
    assert.equal(typeof empty.replyText, 'string');
    assert.ok(Array.isArray(empty.generatedFiles));
    assert.ok(empty.error instanceof Error);
    assert.equal(typeof empty.threadId, 'string');

    assert.equal(await adapter.resetSession('!room:example.org', 'thread-1'), undefined);
  }
});

test('listAvailableModels always returns the documented catalog shape', async (t) => {
  const codex = new CodexAdapter({ defaultCliPath: fixture('fake-codex.mjs') });
  t.after(() => codex.close());
  const codexCatalog = await codex.listAvailableModels();
  assert.deepEqual(codexCatalog.models.map((model) => model.id), ['fake-codex-model', 'fake-codex-fast']);
  assert.deepEqual(codexCatalog.models[0], {
    id: 'fake-codex-model',
    name: 'Fake Codex',
    description: 'fixture model'
  });
  assert.deepEqual(new Set(codexCatalog.efforts), new Set(['low', 'high', 'minimal', 'medium']));

  const agy = new AntigravityAdapter({ defaultCliPath: fixture('fake-agy.mjs') });
  t.after(() => agy.close());
  const agyCatalog = await agy.listAvailableModels();
  assert.deepEqual(agyCatalog.models.map((model) => model.id), ['fixture-agy-low', 'fixture-agy-high']);
  assert.deepEqual(agyCatalog.models[0], {
    id: 'fixture-agy-low',
    name: 'Fixture Agy (Low)',
    description: ''
  });
  assert.ok(agyCatalog.efforts.includes('high'));

  const zcode = new ZCodeAdapter({ defaultCliPath: fixture('fake-zcode.mjs') });
  t.after(() => zcode.close());
  const zcodeCatalog = await zcode.listAvailableModels();
  assert.ok(zcodeCatalog.models.length > 0);
  assert.deepEqual(zcodeCatalog.efforts, []);
  for (const model of zcodeCatalog.models) {
    assert.equal(typeof model.id, 'string');
    assert.equal(typeof model.name, 'string');
    assert.equal(typeof model.description, 'string');
  }
});

test('missing cwd is reported through the canonical error result', async (t) => {
  for (const entry of CASES) {
    const adapter = new entry.Ctor({ defaultCliPath: fixture(entry.fixture) });
    t.after(() => adapter.close?.());
    const result = await adapter.executeTurn({
      prompt: 'hello',
      cwd: '/definitely/not/a/real/workspace/matrix-bridge'
    });
    assert.equal(result.replyText, '');
    assert.deepEqual(result.generatedFiles, []);
    assert.ok(result.error instanceof Error);
    assert.match(result.error.message, /cwd does not exist/);
  }
});

test('resetSession clears adapter-side session bookkeeping', async (t) => {
  for (const entry of CASES) {
    const adapter = new entry.Ctor({ defaultCliPath: fixture(entry.fixture) });
    t.after(() => adapter.close?.());
    adapter.sessions.set('!room:example.org', new Set(['thread-a', 'thread-b']));
    await adapter.resetSession('!room:example.org', 'thread-a');
    assert.deepEqual([...adapter.sessions.get('!room:example.org')], ['thread-b']);
    await adapter.resetSession('!room:example.org', '');
    assert.equal(adapter.sessions.has('!room:example.org'), false);
  }
});

test('generated file scanning resolves relative paths and skips missing files', async (t) => {
  const cwd = workspace(t);
  const { writeFileSync } = await import('node:fs');
  const relative = 'reports/result.md';
  const { mkdirSync } = await import('node:fs');
  mkdirSync(`${cwd}/reports`, { recursive: true });
  writeFileSync(`${cwd}/${relative}`, 'ok');

  for (const scan of [scanCodex, scanAgy, scanZcode, scanClaude, scanDsh]) {
    const files = scan(
      `![chart](${relative})\n<send-file path="missing.txt" />\n[SEND_FILE: /nope]`,
      cwd
    );
    assert.deepEqual(files, [`${cwd}/${relative}`]);
  }
});
