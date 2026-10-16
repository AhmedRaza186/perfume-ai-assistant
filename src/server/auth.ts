import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db } from './db';
import { configuredOrigins, hash, PublicError } from './http';
import { chatAccess } from './access';

const derive = promisify(scrypt);
const CUSTOMER_COOKIE = 'perfume_customer';
const OWNER_COOKIE = 'perfume_owner';
export async function validSession(token: string | undefined, role: string): Promise<boolean> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  return !!await db().prepare('SELECT token FROM sessions WHERE token=? AND role=? AND expires>?').get(hash(token), role, Date.now());
}
/** Store administration is open to every assigned account and to the owner. */
export async function isAdmin() { return (await chatAccess()).granted; }
export async function requireAdmin() { if (!await isAdmin()) throw new PublicError(401, 'Please sign in with your assigned username and password.', 'unauthorized'); }
export function secureCookies() {
  if (process.env.VERCEL) return true; // Vercel always serves HTTPS.
  const origin = new URL(configuredOrigins()[0] || 'http://localhost:3000');
  if (origin.protocol === 'https:') return true;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new PublicError(503, 'HTTPS is required for this server.');
  return false; // HTTP cookies only on loopback for a local demo.
}
async function createSession(role: string, name: string, lifetime: number) {
  const token = randomBytes(32).toString('hex');
  const secure = secureCookies();
  await db().prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), role, Date.now() + lifetime * 1000);
  (await cookies()).set(name, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: lifetime });
  return hash(token);
}
/** Conversations belong to the signed-in account, so history follows the user across devices. */
export async function customerOwner() {
  const access = await chatAccess();
  if (access.owner) return access.owner;
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (await validSession(token, 'customer')) return hash(token!);
  return createSession('customer', CUSTOMER_COOKIE, 86400);
}
export async function existingCustomerOwner() {
  const access = await chatAccess();
  if (access.owner) return access.owner;
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!await validSession(token, 'customer')) throw new PublicError(401, 'Audio session expired.');
  return hash(token!);
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(encoded || '')) return false;
  return timingSafeEqual(await derive(password, salt, 64) as Buffer, Buffer.from(encoded, 'hex'));
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64) as Buffer).toString('hex')}`;
}
export async function isOwner() { return validSession((await cookies()).get(OWNER_COOKIE)?.value, 'owner'); }
export async function requireOwner() { if (!await isOwner()) throw new PublicError(401, 'Please sign in to the owner portal.', 'unauthorized'); }
export async function ownerLogin(username: string, password: string) {
  const configured = process.env.OWNER_PASSWORD_HASH;
  if (!configured || !process.env.OWNER_USERNAME) throw new PublicError(503, 'Owner sign-in is not configured. Set OWNER_USERNAME and generate OWNER_PASSWORD_HASH with npm run owner:hash.', 'configuration_required');
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(configured)) throw new PublicError(503, 'OWNER_PASSWORD_HASH is invalid. Generate it again with npm run owner:hash.', 'configuration_required');
  const correctPassword = await verifyPassword(password, configured);
  if (!correctPassword || username !== process.env.OWNER_USERNAME) throw new PublicError(401, 'Invalid username or password.');
  const previous = (await cookies()).get(OWNER_COOKIE)?.value;
  if (previous) await db().prepare('DELETE FROM sessions WHERE token=?').run(hash(previous));
  await createSession('owner', OWNER_COOKIE, 8 * 3600);
}
export async function ownerLogout() {
  const jar = await cookies(); const token = jar.get(OWNER_COOKIE)?.value;
  if (token) await db().prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
  jar.set(OWNER_COOKIE, '', { httpOnly: true, secure: secureCookies(), sameSite: 'strict', path: '/', maxAge: 0 });
}
