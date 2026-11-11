#!/usr/bin/env node
/**
 * Fake `zcode` CLI used by adapter tests.
 */

const args = process.argv.slice(2);
const env = process.env;

if (args[0] === 'models') {
  process.stdout.write(`${JSON.stringify({
    models: [
      { id: 'fixture/zcode-one', name: 'Fixture ZCode One', description: 'first' },
      { id: 'fixture/zcode-two', name: 'Fixture ZCode Two', description: 'second' }
    ],
    efforts: ['low', 'high']
  })}\n`);
  process.exit(0);
}

const valueOf = (name) => {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
};

const promptIndex = args.indexOf('-p');
const prompt = valueOf('--prompt') || (promptIndex >= 0 ? args[promptIndex + 1] || '' : '');
const model = valueOf('--model');
const effort = valueOf('--effort');
let resume = '';
const attachments = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--resume') resume = args[index + 1] || '';
  if (args[index] === '--attach') attachments.push(args[index + 1] || '');
}

if (env.FAKE_ZCODE_HANG === '1') {
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}

if (env.FAKE_ZCODE_FAIL === '1') {
  process.stderr.write(env.FAKE_ZCODE_STDERR || 'zcode fixture failure\n');
  process.exit(Number(env.FAKE_ZCODE_EXIT_CODE || 6));
}

if (resume === 'old-session' && env.FAKE_ZCODE_RESUME_FAIL === '1') {
  process.stderr.write('session not found\n');
  process.exit(8);
}

let response = env.FAKE_ZCODE_REPLY || 'fake zcode reply';
if (env.FAKE_ZCODE_ECHO === '1') {
  response = JSON.stringify({ prompt, resume, attachments, model: model || undefined, effort: effort || undefined });
}

const payload = {
  sessionId: resume ? 'sess-existing' : 'sess-new',
  response
};

if (env.FAKE_ZCODE_NOISE === '1') process.stdout.write('log: preparing zcode turn\n');
process.stdout.write(`${JSON.stringify(payload)}\n`);
