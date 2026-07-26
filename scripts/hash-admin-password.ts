import { createInterface } from 'node:readline';
import { hashPassword } from '../src/lib/auth/scrypt';

const MINIMUM_PASSWORD_LENGTH = 12;
const SIGINT_EXIT_CODE = 130;

// On a real TTY, the terminal driver echoes typed characters before Node
// ever sees them (canonical-mode line discipline). The only way to suppress
// that is to disable canonical mode with `setRawMode(true)` and read/echo
// keys ourselves, one at a time.
//
// A single 'data' listener is installed for the whole prompt session rather
// than one per prompt: under piped/pty input, both lines can arrive as one
// flushed chunk, and processing that chunk per-prompt would discard whatever
// followed the first line's newline. Buffering undelivered characters here
// and draining them into the next prompt keeps that second line from being
// lost.
function createTtyPasswordReader() {
  const stdin = process.stdin;
  const setRawMode = stdin.setRawMode?.bind(stdin);
  if (!setRawMode) {
    throw new Error('createTtyPasswordReader requires a TTY stdin.');
  }
  const wasRaw = stdin.isRaw ?? false;

  setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  const pendingChars: string[] = [];
  let deliverChar: ((char: string) => void) | undefined;

  const onData = (chunk: string) => {
    for (const char of chunk) {
      if (deliverChar) {
        deliverChar(char);
      } else {
        pendingChars.push(char);
      }
    }
  };
  stdin.on('data', onData);

  const close = () => {
    stdin.removeListener('data', onData);
    setRawMode(wasRaw);
    stdin.pause();
  };

  const readPassword = (question: string): Promise<string> => {
    process.stdout.write(question);
    let password = '';

    return new Promise<string>((resolve) => {
      const handleChar = (char: string) => {
        if (char === '\r' || char === '\n') {
          deliverChar = undefined;
          process.stdout.write('\n');
          resolve(password);
          return;
        }

        if (char === '\x03') {
          deliverChar = undefined;
          process.stdout.write('\n');
          close();
          process.exit(SIGINT_EXIT_CODE);
          return;
        }

        if (char === '\x7f' || char === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          return;
        }

        // Ignore other C0 control characters (e.g. a stray EOF marker some
        // ttys inject): they aren't intended password content.
        if (/[\x00-\x1f]/.test(char)) {
          return;
        }

        password += char;
        process.stdout.write('*');
      };

      deliverChar = handleChar;
      while (pendingChars.length > 0 && deliverChar) {
        handleChar(pendingChars.shift() as string);
      }
    });
  };

  return { readPassword, close };
}

// Calling `rl.question()` a second time on the same readline interface is
// unreliable here: piped input (as used by the round-trip verification below)
// can arrive as a single chunk containing both lines, and the async-iterator
// reads them one at a time without that race.
function promptFromPipedInput(lines: AsyncIterator<string>, question: string): Promise<string> {
  process.stdout.write(question);
  return lines.next().then(({ value }) => {
    process.stdout.write('\n');
    return value ?? '';
  });
}

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION_FAILURE = 1;

// Returns an exit code rather than calling `process.exit` directly so the
// `finally` block below always runs first and restores the terminal, no
// matter which path (success or a validation failure) produced that code.
async function main(): Promise<number> {
  const isTty = Boolean(process.stdin.isTTY);
  const ttyReader = isTty ? createTtyPasswordReader() : undefined;
  const rl = isTty ? undefined : createInterface({ input: process.stdin, terminal: false });
  const lines = rl?.[Symbol.asyncIterator]();

  const prompt = (question: string) =>
    ttyReader ? ttyReader.readPassword(question) : promptFromPipedInput(lines!, question);

  try {
    const password = await prompt('Admin password: ');

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      console.error(`Refusing to hash a password shorter than ${MINIMUM_PASSWORD_LENGTH} characters.`);
      return EXIT_VALIDATION_FAILURE;
    }

    const confirmation = await prompt('Confirm password: ');

    if (confirmation !== password) {
      console.error('Passwords do not match.');
      return EXIT_VALIDATION_FAILURE;
    }

    const hash = await hashPassword(password);

    console.log('\nAdd this line to .env (never commit it):\n');
    console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
    return EXIT_SUCCESS;
  } finally {
    ttyReader?.close();
    rl?.close();
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(EXIT_VALIDATION_FAILURE);
  });
