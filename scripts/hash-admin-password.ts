import { createInterface } from 'node:readline';
import { hashPassword } from '../src/lib/auth/scrypt';

const MINIMUM_PASSWORD_LENGTH = 12;

// The readline interface is consumed once via its async-iterator protocol and
// shared across both prompts. Calling `rl.question()` a second time on the
// same interface is unreliable here: piped input (as used by the round-trip
// verification below) can arrive as a single chunk containing both lines, and
// the async-iterator reads them one at a time without that race.
function promptSilently(lines: AsyncIterator<string>, question: string): Promise<string> {
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === '\n' || char === '\r' || char === '') {
        process.stdin.removeListener('data', onData);
        return;
      }
      process.stdout.write('*');
    };

    process.stdout.write(question);
    process.stdin.on('data', onData);

    void lines.next().then(({ value }) => {
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value ?? '');
    });
  });
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const lines = rl[Symbol.asyncIterator]();

  const password = await promptSilently(lines, 'Admin password: ');

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    console.error(`Refusing to hash a password shorter than ${MINIMUM_PASSWORD_LENGTH} characters.`);
    rl.close();
    process.exit(1);
  }

  const confirmation = await promptSilently(lines, 'Confirm password: ');
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
