#!/usr/bin/env node
/**
 * Fake `dsh` CLI used by adapter tests.
 *
 * Mirrors the headless profile's `--json` contract: one JSON object per line,
 * opening with `session` and closing with `final` (or `error`). Tests drive it
 * through environment variables instead of real Matrix or model credentials.
 *
 *   FAKE_DSH_REPLY           final answer text (default "fake dsh reply")
 *   FAKE_DSH_ECHO=1          answer echoes the parsed invocation as JSON
 *   FAKE_DSH_SESSION_ID      override the emitted Session identity
 *   FAKE_DSH_SPLIT_TEXT=1    emit two text events instead of one
 *   FAKE_DSH_EMPTY_FINAL=1   send an empty final.text (text events carry the answer)
 *   FAKE_DSH_SOFT_ERROR=1    exit 0 with final.reason.kind = "error"
 *   FAKE_DSH_NOISE=1         prepend a non-JSON diagnostic line to stdout
 *   FAKE_DSH_CHUNKED=1       write the stream in small chunks (partial-line parsing)
 *   FAKE_DSH_FAIL=1          emit an error event and exit non-zero
 *   FAKE_DSH_RESUME_FAIL=1   reject a given --session-id the way dsh does
 *   FAKE_DSH_HANG=1          never finish (adapter timeout tests)
 */

const args = process.argv.slice(2);
const env = process.env;

const VALUE_FLAGS = new Map([
  ['--profile', 'profile'],
  ['--session-id', 'sessionId'],
  ['--permission-mode', 'permissionMode'],
  ['--approval-policy', 'approvalPolicy'],
  ['--model', 'model'],
  ['--reasoning-effort', 'effort'],
  ['--effort', 'effort']
]);

const options = {
  profile: '',
  sessionId: '',
  permissionMode: '',
  approvalPolicy: '',
  model: '',
  effort: '',
  json: false,
  addDirs: []
};
const positionals = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--json') {
    options.json = true;
    continue;
  }
  if (arg === '--add-dir') {
    options.addDirs.push(args[index + 1] ?? '');
    index += 1;
    continue;
  }
  if (VALUE_FLAGS.has(arg)) {
    options[VALUE_FLAGS.get(arg)] = args[index + 1] ?? '';
    index += 1;
    continue;
  }
  if (arg.startsWith('--') && arg.includes('=')) {
    const at = arg.indexOf('=');
    const key = arg.slice(0, at);
    const value = arg.slice(at + 1);
    if (key === '--add-dir') options.addDirs.push(value);
    else if (VALUE_FLAGS.has(key)) options[VALUE_FLAGS.get(key)] = value;
    continue;
  }
  positionals.push(arg);
}

const task = positionals.join(' ');
const sessionId = options.sessionId || env.FAKE_DSH_SESSION_ID || 'session-new';
const writeLine = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

async function main() {
  if (env.FAKE_DSH_HANG === '1') {
    setInterval(() => {}, 1000);
    await new Promise(() => {});
    return;
  }

  if (env.FAKE_DSH_RESUME_FAIL === '1' && options.sessionId) {
    const message = `session "${options.sessionId}" does not exist; omit --session-id to start a new Session`;
    writeLine({ type: 'error', message });
    process.stderr.write(`dsh: ${message}\n`);
    process.exitCode = Number(env.FAKE_DSH_RESUME_EXIT_CODE || 1);
    return;
  }

  if (env.FAKE_DSH_FAIL === '1') {
    const message = env.FAKE_DSH_STDERR || 'dsh fixture failure';
    process.stderr.write(`${message}\n`);
    writeLine({ type: 'error', message });
    process.exitCode = Number(env.FAKE_DSH_EXIT_CODE || 1);
    return;
  }

  const reply = env.FAKE_DSH_REPLY || 'fake dsh reply';
  const echoed = env.FAKE_DSH_ECHO === '1'
    ? JSON.stringify({
      profile: options.profile,
      json: options.json,
      permissionMode: options.permissionMode,
      approvalPolicy: options.approvalPolicy,
      sessionId: options.sessionId,
      task,
      addDirs: options.addDirs,
      model: options.model || undefined,
      effort: options.effort || undefined
    })
    : reply;
  const finalText = env.FAKE_DSH_EMPTY_FINAL === '1' ? '' : echoed;

  const events = [
    { type: 'session', sessionId, cwd: process.cwd() },
    { type: 'status', phase: 'turn_start', turn: 1 },
    { type: 'thinking', text: env.FAKE_DSH_THINKING || 'weighing the task' }
  ];
  if (env.FAKE_DSH_SPLIT_TEXT === '1') {
    const at = Math.max(1, Math.floor(echoed.length / 2));
    events.push({ type: 'text', text: echoed.slice(0, at) });
    events.push({ type: 'text', text: echoed.slice(at) });
  } else {
    events.push({ type: 'text', text: echoed });
  }
  const reason = env.FAKE_DSH_SOFT_ERROR === '1'
    ? {
      kind: 'error',
      error: {
        code: env.FAKE_DSH_SOFT_ERROR_CODE || 'TURN_FAILED',
        message: env.FAKE_DSH_SOFT_ERROR_MESSAGE || 'the model rejected the turn'
      }
    }
    : { kind: 'completed' };
  events.push({ type: 'status', phase: 'turn_end', turn: 1, reason });
  events.push({ type: 'final', sessionId, reason, text: finalText });

  let payload = env.FAKE_DSH_NOISE === '1' ? 'dsh: preparing workspace\n' : '';
  for (const event of events) payload += `${JSON.stringify(event)}\n`;

  if (env.FAKE_DSH_CHUNKED === '1') {
    const size = Number(env.FAKE_DSH_CHUNK_SIZE || 11);
    for (let index = 0; index < payload.length; index += size) {
      process.stdout.write(payload.slice(index, index + size));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  } else {
    process.stdout.write(payload);
  }
}

await main();
