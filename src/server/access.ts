import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { hash, PublicError } from './http';
import { isOwner, passwordHash, secureCookies, verifyPassword } from './auth';

const CHAT_COOKIE = 'perfume_chat_user';
const CHAT_LIFETIME = 30 * 86400;
// Compared against when the username is unknown, so a miss costs the same scrypt time as a hit.
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

export interface ChatUser { id: string; username: string; note: string; created: number; expires: number | null; active: boolean; expired: boolean; uses: number; lastUsed: number | null }
interface ChatUserRow { id: string; username: string; note: string; created: number; expires: number | null; active: number; uses: number; last_used: number | null }

const toUser = (row: ChatUserRow): ChatUser => ({ id: row.id, username: row.username, note: row.note, created: row.created, expires: row.expires,
  active: !!row.active, expired: !!row.expires && row.expires <= Date.now(), uses: row.uses, lastUsed: row.last_used });
export const listChatUsers = async () => (await db().prepare('SELECT id,username,note,created,expires,active,uses,last_used FROM chat_users ORDER BY created DESC').all<ChatUserRow>()).map(toUser);

export async function createChatUser(username: string, password: string, note: string, days?: number) {
  if (await db().prepare('SELECT id FROM chat_users WHERE lower(username)=lower(?)').get(username)) throw new PublicError(409, 'This username already exists. Choose a different one.');
  await db().prepare('INSERT INTO chat_users (id,username,password_hash,note,created,expires) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), username, await passwordHash(password), note, Date.now(), days ? Date.now() + days * 86400_000 : null);
  return listChatUsers();
}
export async function resetChatUserPassword(id: string, password: string) {
  if (!(await db().prepare('UPDATE chat_users SET password_hash=? WHERE id=?').run(await passwordHash(password), id)).changes) throw new PublicError(404, 'User not found.');
  await db().prepare('DELETE FROM chat_sessions WHERE user_id=?').run(id);
  return listChatUsers();
}
export async function setChatUserActive(id: string, active: boolean) {
  if (!(await db().prepare('UPDATE chat_users SET active=? WHERE id=?').run(active ? 1 : 0, id)).changes) throw new PublicError(404, 'User not found.');
  if (!active) await db().prepare('DELETE FROM chat_sessions WHERE user_id=?').run(id);
  return listChatUsers();
}
export async function deleteChatUser(id: string) {
  await db().prepare('DELETE FROM chat_sessions WHERE user_id=?').run(id);
  if (!(await db().prepare('DELETE FROM chat_users WHERE id=?').run(id)).changes) throw new PublicError(404, 'User not found.');
  return listChatUsers();
}

/** Who may use the assistant and store admin: an assigned account, or the owner. `owner` keys their saved history. */
export async function chatAccess(): Promise<{ granted: boolean; username: string | null; owner: string | null }> {
  const token = (await cookies()).get(CHAT_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const now = Date.now();
    const row = await db().prepare(`SELECT u.id, u.username FROM chat_sessions s JOIN chat_users u ON u.id=s.user_id
      WHERE s.token=? AND s.expires>? AND u.active=1 AND (u.expires IS NULL OR u.expires>?)`).get<{ id: string; username: string }>(hash(token), now, now);
    if (row) return { granted: true, username: row.username, owner: `user:${row.id}` };
  }
  return await isOwner() ? { granted: true, username: null, owner: 'owner' } : { granted: false, username: null, owner: null };
}
export async function requireAccess() {
  if (!(await chatAccess()).granted) throw new PublicError(401, 'Sign in with your assigned username and password to use the assistant.', 'access_required');
}
export async function chatLogin(username: string, password: string) {
  const now = Date.now();
  const row = await db().prepare('SELECT id, password_hash, expires, active FROM chat_users WHERE lower(username)=lower(?)')
    .get<{ id: string; password_hash: string; expires: number | null; active: number }>(username);
  const correct = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !correct) throw new PublicError(401, 'Invalid username or password.', 'access_denied');
  if (!row.active || (row.expires && row.expires <= now)) throw new PublicError(403, 'This account is disabled or expired. Contact the store.', 'access_denied');
  const expires = Math.min(now + CHAT_LIFETIME * 1000, row.expires ?? Infinity);
  const token = randomBytes(32).toString('hex');
  const jar = await cookies();
  const previous = jar.get(CHAT_COOKIE)?.value;
  if (previous) await db().prepare('DELETE FROM chat_sessions WHERE token=?').run(hash(previous));
  await db().prepare('INSERT INTO chat_sessions VALUES (?,?,?)').run(hash(token), row.id, expires);
  await db().prepare('UPDATE chat_users SET uses=uses+1, last_used=? WHERE id=?').run(now, row.id);
  jar.set(CHAT_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: 'strict', path: '/', maxAge: Math.floor((expires - now) / 1000) });
}
export async function chatLogout() {
  const jar = await cookies(); const token = jar.get(CHAT_COOKIE)?.value;
  if (token) await db().prepare('DELETE FROM chat_sessions WHERE token=?').run(hash(token));
  jar.set(CHAT_COOKIE, '', { httpOnly: true, secure: secureCookies(), sameSite: 'strict', path: '/', maxAge: 0 });
}
