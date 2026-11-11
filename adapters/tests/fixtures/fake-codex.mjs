#!/usr/bin/env node
/**
 * Fake Codex app-server / `codex debug models` used by adapter tests.
 * No network, no real Codex installation required.
 */

import { createInterface } from 'node:readline';

const send = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`);

if (process.argv.slice(2).includes('models')) {
  process.stdout.write(`${JSON.stringify({
    models: [
      {
        slug: 'fake-codex-model',
        display_name: 'Fake Codex',
        description: 'fixture model',
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }]
      },
      {
        slug: 'fake-codex-fast',
        display_name: 'Fake Codex Fast',
        description: 'fixture fast model',
        supported_reasoning_levels: ['minimal', 'medium']
      }
    ]
  })}\n`);
  process.exit(0);
}

const env = process.env;
let approvalDecision = '';
let inputAnswers = null;
let pendingApproval = false;
let pendingInput = false;
let activeThread = '';
let activeTurn = '';

if (env.FAKE_STDERR) process.stderr.write(env.FAKE_STDERR);

function completeTurn() {
  const approval = approvalDecision || 'decline';
  const answers = inputAnswers || {};
  let text = env.FAKE_REPLY || 'fake codex reply';
  if (env.FAKE_ECHO_DECISION === '1') {
    text = `decision=${approval};answers=${JSON.stringify(answers)}`;
  }
  send({
    method: 'item/completed',
    params: {
      threadId: activeThread,
      turnId: activeTurn,
      item: { type: 'agentMessage', text }
    }
  });
  if (env.FAKE_CHANGED_FILE) {
    send({
      method: 'item/completed',
      params: {
        threadId: activeThread,
        turnId: activeTurn,
        item: {
          type: 'fileChange',
          changes: { [env.FAKE_CHANGED_FILE]: { kind: 'add' } }
        }
      }
    });
  }
  send({
    method: 'turn/completed',
    params: {
      threadId: activeThread,
      turn: { id: activeTurn, status: env.FAKE_FAIL_STATUS || 'completed' }
    }
  });
}

function maybeComplete() {
  if (env.FAKE_NO_REQUESTS === '1') return;
  if (!pendingApproval && !pendingInput) completeTurn();
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }

  // Responses to server-initiated requests.
  if (message.id === 900 && !message.method) {
    approvalDecision = message.result?.decision || 'decline';
    pendingApproval = false;
    maybeComplete();
    return;
  }
  if (message.id === 901 && !message.method) {
    inputAnswers = message.result?.answers || {};
    pendingInput = false;
    maybeComplete();
    return;
  }

  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'fake-codex/1.0' } });
    return;
  }
  if (message.method === 'initialized') return;

  if (message.method === 'thread/start' || message.method === 'thread/resume') {
    if (env.FAKE_THREAD_ERROR === '1') {
      send({ id: message.id, error: { code: -32000, message: 'fake thread failure' } });
      return;
    }
    if (message.method === 'thread/resume' && message.params?.threadId === 'missing') {
      send({ id: message.id, error: { code: -32000, message: 'unknown thread' } });
      return;
    }
    activeThread = message.params?.threadId || env.FAKE_THREAD_ID || 'thread-new';
    send({ id: message.id, result: { thread: { id: activeThread } } });
    return;
  }

  if (message.method === 'turn/start') {
    if (env.FAKE_EXIT_ON_TURN === '1') process.exit(3);
    if (env.FAKE_HANG_TURN === '1') return;
    if (env.FAKE_TURN_START_ERROR === '1') {
      send({ id: message.id, error: { code: -32000, message: 'fake turn/start failure' } });
      return;
    }
    activeTurn = 'turn-1';
    send({ id: message.id, result: { turn: { id: activeTurn } } });
    if (env.FAKE_FAIL_STATUS) {
      send({
        method: 'turn/completed',
        params: { threadId: activeThread, turn: { id: activeTurn, status: env.FAKE_FAIL_STATUS } }
      });
      return;
    }
    if (env.FAKE_NO_REQUESTS === '1') {
      completeTurn();
      return;
    }
    pendingApproval = true;
    pendingInput = true;
    send({
      id: 900,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: activeThread, turnId: activeTurn, command: 'echo test' }
    });
    send({
      id: 901,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: activeThread,
        turnId: activeTurn,
        questions: [{ id: 'q1', header: 'Fixture', question: 'Continue?' }]
      }
    });
    return;
  }

  if (message.id !== undefined && message.method) {
    send({ id: message.id, error: { code: -32601, message: `unsupported: ${message.method}` } });
  }
});
