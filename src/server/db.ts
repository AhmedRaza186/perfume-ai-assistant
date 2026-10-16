import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { INITIAL_PRODUCTS } from '@/fixtures/products';
import { INITIAL_POLICIES } from '@/fixtures/policies';
import type { Product } from '@/types/product';
import type { StorePolicies } from '@/types/policy';
import type { Enquiry } from '@/types/enquiry';
import { migrate } from './migrations';

let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const filename = path.resolve(/* turbopackIgnore: true */ process.env.SQLITE_PATH || './data/store.sqlite');
  mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS turns (conversation TEXT NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL,
      query TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, response TEXT, created INTEGER NOT NULL,
      PRIMARY KEY(conversation, request));
    CREATE TABLE IF NOT EXISTS enquiries (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY, owner TEXT NOT NULL, bytes BLOB NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  migrate(database);
  const insert = database.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)');
  insert.run('products', JSON.stringify(INITIAL_PRODUCTS));
  insert.run('policies', JSON.stringify(INITIAL_POLICIES));
  cleanup();
  const timer = setInterval(() => { try { cleanup(); } catch { /* Retry cleanup on the next request. */ } }, 60_000);
  timer.unref();
  return database;
}
export function readSetting<T>(key: string): T {
  const row = db().prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string };
  return JSON.parse(row.value) as T;
}
export function writeSetting(key: string, value: unknown) {
  db().prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(value), key);
}
export const products = () => readSetting<Product[]>('products');
export const policies = () => readSetting<StorePolicies>('policies');
export function enquiries(): Enquiry[] {
  return (db().prepare('SELECT value FROM enquiries ORDER BY rowid DESC LIMIT 500').all() as { value: string }[])
    .map(row => JSON.parse(row.value));
}
export function transaction<T>(fn: () => T): T {
  const connection = db();
  connection.exec('BEGIN IMMEDIATE');
  try { const result = fn(); connection.exec('COMMIT'); return result; }
  catch (error) { connection.exec('ROLLBACK'); throw error; }
}
export function cleanup() {
  const now = Date.now();
  transaction(() => {
    for (const table of ['sessions', 'audio', 'recordings', 'limits']) db().prepare(`DELETE FROM ${table} WHERE expires < ?`).run(now);
    // Pending provider calls never run indefinitely or get retried automatically.
    db().prepare("UPDATE turns SET status='failed' WHERE status='pending' AND created < ?").run(now - 180_000);
    const cutoff = now - 30 * 86400_000;
    for (const table of ['human_messages', 'order_drafts', 'order_requests', 'recordings'])
      db().prepare(`DELETE FROM ${table} WHERE conversation IN (SELECT id FROM conversations WHERE created < ?)`).run(cutoff);
    db().prepare('DELETE FROM customer_preferences WHERE owner NOT IN (SELECT token FROM sessions WHERE role=?)').run('customer');
    db().prepare('UPDATE customer_preferences SET current_conversation=NULL WHERE current_conversation IN (SELECT id FROM conversations WHERE created < ?)').run(cutoff);
    db().prepare('DELETE FROM enquiries WHERE conversation IN (SELECT id FROM conversations WHERE created < ?)').run(cutoff);
    db().prepare('DELETE FROM turns WHERE conversation IN (SELECT id FROM conversations WHERE created < ?)').run(cutoff);
    db().prepare('DELETE FROM conversations WHERE created < ?').run(cutoff);
  });
}
