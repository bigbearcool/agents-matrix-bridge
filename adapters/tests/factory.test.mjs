import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentRuntimeAdapter } from '../../packages/matrix-core/src/adapter.mjs';
import {
  ADAPTER_NAMES,
  ADAPTERS,
  AntigravityAdapter,
  CodexAdapter,
  ZCodeAdapter,
  createAdapter,
  getAdapterClass
} from '../index.mjs';

test('createAdapter maps every canonical adapter name', () => {
  const cases = [
    ['codex', CodexAdapter, 'codex'],
    ['antigravity', AntigravityAdapter, 'antigravity'],
    ['zcode', ZCodeAdapter, 'zcode']
  ];
  for (const [name, Ctor, expectedName] of cases) {
    const adapter = createAdapter(name, { defaultCliPath: `/tmp/${name}-cli` });
    assert.ok(adapter instanceof Ctor);
    assert.equal(adapter.name, expectedName);
    assert.equal(adapter.defaultCliPath, `/tmp/${name}-cli`);
    assert.equal(isAgentRuntimeAdapter(adapter), true);
  }
  assert.deepEqual(ADAPTER_NAMES, ['codex', 'antigravity', 'zcode']);
  assert.equal(ADAPTERS.codex, CodexAdapter);
});

test('createAdapter accepts aliases and case-insensitive names', () => {
  assert.ok(createAdapter('agy') instanceof AntigravityAdapter);
  assert.ok(createAdapter('Anti-Gravity') instanceof AntigravityAdapter);
  assert.ok(createAdapter('z-code') instanceof ZCodeAdapter);
  assert.ok(createAdapter('ZCODE') instanceof ZCodeAdapter);
  assert.ok(createAdapter('codex-cli') instanceof CodexAdapter);
  assert.equal(getAdapterClass('AGY'), AntigravityAdapter);
});

test('createAdapter supports the object form and legacy CLI option names', () => {
  const adapter = createAdapter({ name: 'zcode', defaultCliPath: '/tmp/zcode-object' });
  assert.ok(adapter instanceof ZCodeAdapter);
  assert.equal(adapter.defaultCliPath, '/tmp/zcode-object');

  assert.equal(createAdapter('codex', { codex_cmd: '/tmp/codex-legacy' }).defaultCliPath, '/tmp/codex-legacy');
  assert.equal(createAdapter('antigravity', { agy_cmd: '/tmp/agy-legacy' }).defaultCliPath, '/tmp/agy-legacy');
  assert.equal(createAdapter('zcode', { zcode_cmd: '/tmp/zcode-legacy' }).defaultCliPath, '/tmp/zcode-legacy');
});

test('unknown adapter names fail with a descriptive error', () => {
  assert.throws(() => createAdapter('unknown-agent'), /Unknown adapter "unknown-agent"/);
  assert.throws(() => createAdapter(''), /Unknown adapter/);
  assert.throws(() => createAdapter(null), /Unknown adapter/);
  assert.throws(() => getAdapterClass('claude'), /Available adapters: codex, antigravity, zcode/);
});

test('invalid options are rejected early', () => {
  assert.throws(() => createAdapter('codex', 'not-an-object'), /options must be an object/);
});
