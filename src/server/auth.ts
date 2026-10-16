import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db } from './db';
import { hash, PublicError } from './http';

const derive = promisify(scrypt);
const ADMIN_COOKIE = 'perfume_admin';
const CUSTOMER_COOKIE = 'perfume_customer';
export function validSession(token: string | undefined, role: string): boolean {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  return !!db().prepare('SELECT token FROM sessions WHERE token=? AND role=? AND expires>?').get(hash(token), role, Date.now());
}
export async function isAdmin() { return validSession((await cookies()).get(ADMIN_COOKIE)?.value, 'admin'); }
export async function requireAdmin() { if (!await isAdmin()) throw new PublicError(401, 'Please sign in as an administrator.', 'unauthorized'); }
function secureCookies() {
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3000');
  if (origin.protocol === 'https:') return true;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new PublicError(503, 'HTTPS is required for this server.');
  return false; // HTTP cookies only on loopback for a local demo.
}
async function createSession(role: string, name: string, lifetime: number) {
  const token = randomBytes(32).toString('hex');
  const secure = secureCookies();
  db().prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), role, Date.now() + lifetime * 1000);
  (await cookies()).set(name, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: lifetime });
  return hash(token);
}
export async function customerOwner() {
  const jar = await cookies(); const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (validSession(token, 'customer')) return hash(token!);
  return createSession('customer', CUSTOMER_COOKIE, 86400);
}
export async function existingCustomerOwner() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!validSession(token, 'customer')) throw new PublicError(401, 'Audio session expired.');
  return hash(token!);
}
export async function login(username: string, password: string) {
  const configured = process.env.ADMIN_PASSWORD_HASH;
  if (!configured || !process.env.ADMIN_USERNAME) throw new PublicError(503, 'Admin sign-in is not configured. Set ADMIN_USERNAME and generate ADMIN_PASSWORD_HASH with npm run admin:hash.', 'configuration_required');
  const [salt, encoded] = configured.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(encoded || '')) throw new PublicError(503, 'The admin password configuration is invalid. Generate ADMIN_PASSWORD_HASH again with npm run admin:hash.', 'configuration_required');
  const result = await derive(password, salt, 64) as Buffer;
  const correctPassword = timingSafeEqual(result, Buffer.from(encoded, 'hex'));
  if (!correctPassword || username !== process.env.ADMIN_USERNAME) throw new PublicError(401, 'Invalid username or password.');
  const previous = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (previous) db().prepare('DELETE FROM sessions WHERE token=?').run(hash(previous));
  await createSession('admin', ADMIN_COOKIE, 8 * 3600);
}
export async function logout() {
  const jar = await cookies(); const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
  jar.set(ADMIN_COOKIE, '', { httpOnly: true, secure: secureCookies(), sameSite: 'strict', path: '/', maxAge: 0 });
}
