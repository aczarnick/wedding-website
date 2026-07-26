import { randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// `scrypt` is overloaded (with/without an options object); TypeScript's
// generic `promisify` resolves only the first (no-options) overload, even
// though the options-accepting call works correctly at runtime. Assert the
// precise signature Node actually implements rather than widening to `any`.
const scryptAsync = promisify(scrypt) as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const ALGORITHM = 'scrypt';
const FIELD_SEPARATOR = ':';
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const DEFAULT_PARAMETERS = { cost: 16384, blockSize: 8, parallelization: 1 } as const;

// scrypt's working memory is approximately `SCRYPT_MEMORY_FACTOR * cost * blockSize`
// bytes; bound that product directly rather than bounding cost and blockSize
// independently, since either factor alone can be small while their product
// still drives an unbounded allocation.
const SCRYPT_MEMORY_FACTOR = 128;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_PARALLELIZATION = 16;

type ScryptParameters = {
  cost: number;
  blockSize: number;
  parallelization: number;
};

type ParsedHash = ScryptParameters & {
  salt: Buffer;
  key: Buffer;
};

async function deriveKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  return await scryptAsync(password, salt, KEY_BYTES, {
    N: parameters.cost,
    r: parameters.blockSize,
    p: parameters.parallelization,
    maxmem: MAX_MEMORY_BYTES,
  });
}

function parseHash(stored: string): ParsedHash {
  const [algorithm, cost, blockSize, parallelization, salt, key] = stored.split(FIELD_SEPARATOR);

  if (algorithm !== ALGORITHM) {
    throw new Error(`Unsupported password hash algorithm: ${algorithm}`);
  }

  const parsed: ParsedHash = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt ?? '', 'base64'),
    key: Buffer.from(key ?? '', 'base64'),
  };

  const hasValidParameters =
    Number.isInteger(parsed.cost) &&
    parsed.cost > 0 &&
    Number.isInteger(parsed.blockSize) &&
    parsed.blockSize > 0 &&
    SCRYPT_MEMORY_FACTOR * parsed.cost * parsed.blockSize <= MAX_MEMORY_BYTES &&
    Number.isInteger(parsed.parallelization) &&
    parsed.parallelization > 0 &&
    parsed.parallelization <= MAX_PARALLELIZATION;

  if (!hasValidParameters || parsed.salt.length === 0 || parsed.key.length === 0) {
    throw new Error('Malformed password hash');
  }

  return parsed;
}

/**
 * Hashes a password with scrypt, returning a self-describing string that
 * carries its own salt and cost parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, DEFAULT_PARAMETERS);

  return [
    ALGORITHM,
    DEFAULT_PARAMETERS.cost,
    DEFAULT_PARAMETERS.blockSize,
    DEFAULT_PARAMETERS.parallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join(FIELD_SEPARATOR);
}

/**
 * Verifies a password against a stored scrypt hash.
 * Returns false rather than throwing when the stored hash is unusable.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (password.length === 0 || storedHash.trim().length === 0) {
    return false;
  }

  try {
    const { salt, key, ...parameters } = parseHash(storedHash.trim());
    const candidate = await deriveKey(password, salt, parameters);

    return candidate.length === key.length && timingSafeEqual(candidate, key);
  } catch (error) {
    console.error('Stored password hash is unusable', error);
    return false;
  }
}
