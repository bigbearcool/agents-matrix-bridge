#!/usr/bin/env node
/**
 * Fake `agy` CLI used by adapter tests.
 */

const args = process.argv.slice(2);

if (args[0] === 'models') {
  process.stderr.write('I1111 00:00:00 fake log line\n');
  process.stdout.write('Fetching available models...\n');
  process.stdout.write('fixture-agy-low Fixture Agy (Low)\n');
  process.stdout.write('fixture-agy-high Fixture Agy (High)\n');
  process.exit(0);
}

const env = process.env;
const valueOf = (name) => {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
};

const prompt = valueOf('--print');
const conversation = valueOf('--conversation');
const model = valueOf('--model');
const effort = valueOf('--effort');

if (env.FAKE_AGY_HANG === '1') {
  setInterval(() => {}, 1000);
  // Keep the event loop alive until the adapter kills the process.
  await new Promise(() => {});
}

if (env.FAKE_AGY_FAIL === '1') {
  process.stderr.write(env.FAKE_AGY_STDERR || 'agy fixture failure\n');
  process.exit(Number(env.FAKE_AGY_EXIT_CODE || 5));
}

if (conversation === 'old-session' && env.FAKE_AGY_RESUME_FAIL === '1') {
  process.stderr.write('conversation not found\n');
  process.exit(7);
}

let response = env.FAKE_AGY_REPLY || 'fake agy reply';
if (env.FAKE_AGY_ECHO === '1') {
  response = JSON.stringify({ prompt, model, effort, conversation });
}

const payload = {
  conversation_id: conversation ? 'conv-existing' : 'conv-new',
  response
};

if (env.FAKE_AGY_NOISE === '1') process.stdout.write('log: preparing agy turn\n');
process.stdout.write(`${JSON.stringify(payload)}\n`);
