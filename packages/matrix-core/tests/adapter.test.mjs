import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRuntimeAdapter,
  ADAPTER_METHODS,
  assertAgentRuntimeAdapter,
  isAgentRuntimeAdapter,
  normalizeTurnResult,
  normalizeModelCatalog
} from '../src/adapter.mjs';

test('base adapter exposes the documented default properties', () => {
  const adapter = new AgentRuntimeAdapter();
  assert.equal(adapter.name, 'generic');
  assert.equal(adapter.defaultCliPath, '');
  assert.deepEqual(ADAPTER_METHODS, ['executeTurn', 'listAvailableModels', 'resetSession']);
  for (const method of ADAPTER_METHODS) assert.equal(typeof adapter[method], 'function');
});

test('base adapter constructor accepts name and CLI path', () => {
  const adapter = new AgentRuntimeAdapter({ name: 'codex', defaultCliPath: '/usr/local/bin/codex' });
  assert.equal(adapter.name, 'codex');
  assert.equal(adapter.defaultCliPath, '/usr/local/bin/codex');
});

test('executeTurn must be implemented by a concrete adapter', async () => {
  const adapter = new AgentRuntimeAdapter();
  await assert.rejects(() => adapter.executeTurn({ prompt: 'hello' }), /executeTurn must be implemented/);
});

test('default model listing and session reset are safe no-ops', async () => {
  const adapter = new AgentRuntimeAdapter();
  assert.deepEqual(await adapter.listAvailableModels(), { models: [], efforts: [] });
  assert.equal(await adapter.resetSession('!room:example.org', 'thread-1'), undefined);
});

test('a concrete adapter can implement the full contract', async () => {
  class FakeAdapter extends AgentRuntimeAdapter {
    constructor() {
      super({ name: 'fake', defaultCliPath: 'fake-cli' });
      this.turns = [];
      this.resets = [];
    }
    async executeTurn(params) {
      this.turns.push(params);
      await params.onThread('thread-42');
      return { replyText: `echo:${params.prompt}`, generatedFiles: ['/tmp/out.txt'] };
    }
    async listAvailableModels() {
      return {
        models: [{ id: 'm1', name: 'Model One', description: 'first' }],
        efforts: ['low', 'high']
      };
    }
    async resetSession(roomId, threadId) {
      this.resets.push({ roomId, threadId });
    }
  }

  const adapter = new FakeAdapter();
  assert.equal(isAgentRuntimeAdapter(adapter), true);
  assert.equal(assertAgentRuntimeAdapter(adapter), adapter);
  const result = await adapter.executeTurn({ prompt: 'hi', onThread: async () => {} });
  assert.deepEqual(result, { replyText: 'echo:hi', generatedFiles: ['/tmp/out.txt'] });
  assert.deepEqual(await adapter.listAvailableModels(), {
    models: [{ id: 'm1', name: 'Model One', description: 'first' }],
    efforts: ['low', 'high']
  });
  await adapter.resetSession('!r:example.org', 'thread-42');
  assert.deepEqual(adapter.resets, [{ roomId: '!r:example.org', threadId: 'thread-42' }]);
});

test('adapter validation rejects incomplete objects', () => {
  assert.equal(isAgentRuntimeAdapter(null), false);
  assert.equal(isAgentRuntimeAdapter({}), false);
  assert.throws(() => assertAgentRuntimeAdapter({ executeTurn: async () => {} }), /listAvailableModels must be a function/);
});

test('normalizeTurnResult supports canonical and legacy reply shapes', () => {
  assert.deepEqual(normalizeTurnResult({ replyText: 'ok' }), {
    replyText: 'ok', generatedFiles: [], error: null, threadId: ''
  });
  assert.deepEqual(normalizeTurnResult({ text: 'legacy', generatedFiles: ['/a', '', 3] }), {
    replyText: 'legacy', generatedFiles: ['/a'], error: null, threadId: ''
  });
  assert.equal(normalizeTurnResult('plain').replyText, 'plain');
  assert.equal(normalizeTurnResult(null).replyText, '');
  const failure = new Error('boom');
  assert.equal(normalizeTurnResult({ error: failure }).error, failure);
  assert.equal(normalizeTurnResult({ threadId: 't1' }).threadId, 't1');
});

test('normalizeModelCatalog accepts strings, aliases and deduplicates efforts', () => {
  const catalog = normalizeModelCatalog({
    models: ['plain', { id: 'm2', displayName: 'Two' }, { name: 'invalid' }, { id: 'm3', description: 'd' }],
    efforts: ['low', 'low', 'high', '', 3]
  });
  assert.deepEqual(catalog.models, [
    { id: 'plain', name: 'plain', description: '' },
    { id: 'm2', name: 'Two', description: '' },
    { id: 'm3', name: 'm3', description: 'd' }
  ]);
  assert.deepEqual(catalog.efforts, ['low', 'high']);
  assert.deepEqual(normalizeModelCatalog(null), { models: [], efforts: [] });
});
