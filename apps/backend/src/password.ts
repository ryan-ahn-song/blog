import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const options = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, options, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:16384:8:5:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split(':');
  const valid = parts?.length === 6 && parts.slice(0, 4).join(':') === 'scrypt:16384:8:5' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // Use the same derivation cost when the account does not exist.
  const actual = await derive(password, valid ? parts[4] : '00000000000000000000000000000000');
  const expected = Buffer.from(valid ? parts[5] : '00'.repeat(32), 'hex');
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
