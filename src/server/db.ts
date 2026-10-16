import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { INITIAL_PRODUCTS } from '@/fixtures/products';
import { INITIAL_POLICIES } from '@/fixtures/policies';
import type { Product } from '@/types/product';
import type { StorePolicies } from '@/types/policy';
import type { Enquiry } from '@/types/enquiry';
import { migrate } from './migrations';

// Timestamps are BIGINT milliseconds; read them back as numbers, not strings.
pg.types.setTypeParser(20, Number);

type Row = Record<string, unknown>;
export interface Runner { query(text: string, params?: unknown[]): Promise<{ rows: Row[]; changes: number }> }
interface Driver extends Runner { transaction<T>(fn: (runner: Runner) => Promise<T>): Promise<T>; close(): Promise<void> }

const WRITE_LOCK = 47; // Transactions serialise on one advisory lock, matching the single-writer model.
const scope = new AsyncLocalStorage<Runner>();
let driver: Promise<Driver> | undefined;

/** `?` placeholders become `$1..$n`; none of our SQL has a literal question mark. */
const numbered = (text: string) => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };

async function connect(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  if (url.startsWith('pglite:')) {
    // In-process Postgres for tests; kept out of the bundle.
    const name = '@electric-sql/pglite';
    const { PGlite } = await import(/* turbopackIgnore: true */ name) as typeof import('@electric-sql/pglite');
    const lite = new PGlite(url === 'pglite:memory' ? undefined : url.slice('pglite:'.length));
    const wrap = (target: Pick<typeof lite, 'query'>): Runner => ({
      async query(text, params = []) { const result = await target.query<Row>(numbered(text), params); return { rows: result.rows, changes: result.affectedRows ?? 0 }; },
    });
    return { ...wrap(lite), transaction: fn => lite.transaction(tx => fn(wrap(tx))), close: () => lite.close() };
  }
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE) || 5, idleTimeoutMillis: 30_000 });
  pool.on('error', () => { /* A dropped idle connection is replaced on the next query. */ });
  const wrap = (target: pg.Pool | pg.PoolClient): Runner => ({
    async query(text, params = []) { const result = await target.query(numbered(text), params); return { rows: result.rows, changes: result.rowCount ?? 0 }; },
  });
  return {
    ...wrap(pool), close: () => pool.end(),
    async transaction(fn) {
      const client = await pool.connect();
      // A connection dropped mid-transaction rejects the pending query; without a listener it would also crash the process.
      let broken: Error | undefined;
      const ignore = (error: Error) => { broken = error; };
      client.on('error', ignore);
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.off('error', ignore); client.release(broken); } // A broken connection is discarded, not reused.
    },
  };
}
function ready() {
  driver ??= (async () => {
    const connection = await connect();
    await migrate(connection);
    for (const [key, value] of [['products', INITIAL_PRODUCTS], ['policies', INITIAL_POLICIES], ['revision', 0]] as const)
      await connection.query('INSERT INTO settings VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
    const timer = setInterval(() => { cleanup().catch(() => { /* Retry cleanup on the next interval. */ }); }, 60_000);
    timer.unref();
    return connection;
  })().catch(error => { driver = undefined; throw error; });
  return driver;
}
const runner = async () => scope.getStore() ?? await ready();

/** Same shape as before, but every call is async: `await db().prepare(sql).get(...)`. */
export function db() {
  return {
    prepare: (text: string) => ({
      get: async <T = Row>(...params: unknown[]) => (await (await runner()).query(text, params)).rows[0] as T | undefined,
      all: async <T = Row>(...params: unknown[]) => (await (await runner()).query(text, params)).rows as T[],
      run: async (...params: unknown[]) => ({ changes: (await (await runner()).query(text, params)).changes }),
    }),
    exec: async (text: string) => { await (await runner()).query(text); },
  };
}
export async function closeDb() { const current = driver; driver = undefined; if (current) await (await current).close(); }

// Settings are read many times per request and each database round trip is slow, so reads outside
// transactions use a short in-process cache. Writes here clear it; other instances see changes within the TTL.
const SETTINGS_TTL = 5_000;
const settingsCache = new Map<string, { value: string; at: number }>();
export async function readSetting<T>(key: string): Promise<T> {
  const cached = !scope.getStore() && settingsCache.get(key);
  if (cached && Date.now() - cached.at < SETTINGS_TTL) return JSON.parse(cached.value) as T;
  const row = await db().prepare('SELECT value FROM settings WHERE key=?').get<{ value: string }>(key);
  settingsCache.set(key, { value: row!.value, at: Date.now() });
  return JSON.parse(row!.value) as T;
}
export async function writeSetting(key: string, value: unknown) {
  settingsCache.clear();
  await db().prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(value), key);
}
export const products = () => readSetting<Product[]>('products');
export const policies = () => readSetting<StorePolicies>('policies');
export async function enquiries(): Promise<Enquiry[]> {
  return (await db().prepare('SELECT value FROM enquiries ORDER BY seq DESC LIMIT 500').all<{ value: string }>())
    .map(row => JSON.parse(row.value));
}
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return fn(); // Already inside a transaction.
  const result = await (await ready()).transaction(async connection => {
    await connection.query(`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`);
    return scope.run(connection, fn);
  });
  settingsCache.clear(); // Drop anything cached while this transaction's writes were uncommitted.
  return result;
}
/** Account and owner-portal history is kept; anonymous visitors' conversations expire after 30 days. */
const expiringOwner = "owner NOT LIKE 'user:%' AND owner <> 'owner'";
let lastCleanup = 0;
export async function cleanup(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanup < 60_000) return;
  lastCleanup = now;
  await transaction(async () => {
    for (const table of ['sessions', 'chat_sessions', 'audio', 'recordings', 'limits']) await db().prepare(`DELETE FROM ${table} WHERE expires < ?`).run(now);
    // Pending provider calls never run indefinitely or get retried automatically.
    await db().prepare("UPDATE turns SET status='failed' WHERE status='pending' AND created < ?").run(now - 180_000);
    const cutoff = now - 30 * 86400_000;
    const expired = `SELECT id FROM conversations WHERE created < ? AND ${expiringOwner}`;
    for (const table of ['human_messages', 'order_drafts', 'order_requests', 'recordings', 'enquiries', 'turns'])
      await db().prepare(`DELETE FROM ${table} WHERE conversation IN (${expired})`).run(cutoff);
    await db().prepare(`DELETE FROM customer_preferences WHERE ${expiringOwner} AND owner NOT IN (SELECT token FROM sessions WHERE role=?)`).run('customer');
    await db().prepare(`UPDATE customer_preferences SET current_conversation=NULL WHERE current_conversation IN (${expired})`).run(cutoff);
    await db().prepare(`DELETE FROM conversations WHERE created < ? AND ${expiringOwner}`).run(cutoff);
  });
}
