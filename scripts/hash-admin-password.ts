import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/lib/auth/scrypt';

const MINIMUM_PASSWORD_LENGTH = 12;

// readline echoes every keystroke to its `output` stream whenever `terminal:
// true` (the mode required for the async-iterator protocol used below to
// work on a real TTY). To keep the password from being echoed, readline is
// given this muted stream instead of `process.stdout` — it discards writes
// while `muted` is true, so readline itself can never print what's typed.
// The question text is written directly to `process.stdout` beforehand so
// the prompt still appears.
class MutableOutput extends Writable {
  muted = false;

  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (!this.muted) {
      process.stdout.write(chunk as string | Buffer, encoding);
    }
    callback();
  }
}

// The readline interface is consumed once via its async-iterator protocol and
// shared across both prompts. Calling `rl.question()` a second time on the
// same interface is unreliable here: piped input (as used by the round-trip
// verification below) can arrive as a single chunk containing both lines, and
// the async-iterator reads them one at a time without that race.
function promptSilently(
  lines: AsyncIterator<string>,
  mutableOutput: MutableOutput,
  question: string,
): Promise<string> {
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === '\n' || char === '\r' || char === '') {
        process.stdin.removeListener('data', onData);
        return;
      }
      if (process.stdin.isTTY) {
        process.stdout.write('*');
      }
    };

    process.stdout.write(question);
    mutableOutput.muted = true;
    process.stdin.on('data', onData);

    void lines.next().then(({ value }) => {
      process.stdin.removeListener('data', onData);
      mutableOutput.muted = false;
      process.stdout.write('\n');
      resolve(value ?? '');
    });
  });
}

async function main() {
  const mutableOutput = new MutableOutput();
  const rl = createInterface({ input: process.stdin, output: mutableOutput, terminal: true });
  const lines = rl[Symbol.asyncIterator]();

  const password = await promptSilently(lines, mutableOutput, 'Admin password: ');

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    console.error(`Refusing to hash a password shorter than ${MINIMUM_PASSWORD_LENGTH} characters.`);
    rl.close();
    process.exit(1);
  }

  const confirmation = await promptSilently(lines, mutableOutput, 'Confirm password: ');
  rl.close();

  if (confirmation !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const hash = await hashPassword(password);

  console.log('\nAdd this line to .env (never commit it):\n');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
}

void main();
