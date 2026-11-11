#!/usr/bin/env node
/**
 * Fake `claude` CLI used by adapter tests.
 *
 * Emulates `claude -p --output-format json ...` including --resume, --model
 * and --effort parsing plus the JSON result envelope.
 */

import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const env = process.env;

const options = {
  print: false,
  outputFormat: '',
  permissionMode: '',
  model: '',
  effort: '',
  resume: ''
};
let prompt = '';

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  switch (arg) {
    case '-p':
    case '--print':
      options.print = true;
      break;
    case '--output-format':
      options.outputFormat = argv[index + 1] || '';
      index += 1;
      break;
    case '--permission-mode':
      options.permissionMode = argv[index + 1] || '';
      index += 1;
      break;
    case '--model':
      options.model = argv[index + 1] || '';
      index += 1;
      break;
    case '--effort':
      options.effort = argv[index + 1] || '';
      index += 1;
      break;
    case '--resume':
      options.resume = argv[index + 1] || '';
      index += 1;
      break;
    case '--':
      break;
    default:
      if (!arg.startsWith('-')) prompt = arg;
      break;
  }
}

// Record every invocation so tests can assert resume/retry behaviour.
if (env.FAKE_CLAUDE_ARGV_LOG) {
  try {
    appendFileSync(env.FAKE_CLAUDE_ARGV_LOG, `${JSON.stringify(argv)}\n`);
  } catch {
    // Logging is best-effort only.
  }
}

if (env.FAKE_CLAUDE_HANG === '1') {
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}

if (env.FAKE_CLAUDE_FAIL === '1') {
  process.stderr.write(env.FAKE_CLAUDE_STDERR || 'claude fixture failure\n');
  process.exit(Number(env.FAKE_CLAUDE_EXIT_CODE || 6));
}

if (options.resume === 'old-session' && env.FAKE_CLAUDE_RESUME_FAIL === '1') {
  process.stderr.write('No conversation found with session ID: old-session\n');
  process.exit(1);
}

let reply = env.FAKE_CLAUDE_REPLY || 'fake claude reply';
if (env.FAKE_CLAUDE_ECHO === '1') {
  reply = JSON.stringify({
    prompt,
    resume: options.resume,
    model: options.model || undefined,
    effort: options.effort || undefined,
    print: options.print,
    outputFormat: options.outputFormat,
    permissionMode: options.permissionMode
  });
}

const sessionId = options.resume
  ? 'session-existing'
  : (env.FAKE_CLAUDE_SESSION_ID || 'session-new');

const payload = {
  type: 'result',
  subtype: env.FAKE_CLAUDE_IS_ERROR === '1' ? 'error_during_execution' : 'success',
  is_error: env.FAKE_CLAUDE_IS_ERROR === '1',
  duration_ms: 12,
  num_turns: 1,
  result: env.FAKE_CLAUDE_IS_ERROR === '1'
    ? (env.FAKE_CLAUDE_ERROR_MESSAGE || 'fixture claude error')
    : reply,
  session_id: sessionId,
  total_cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1 }
};

if (env.FAKE_CLAUDE_NOISE === '1') process.stdout.write('log: preparing claude turn\n');
process.stdout.write(`${JSON.stringify(payload)}\n`);
