import type { Runner } from './db';

/** Ordered Postgres migrations, each applied once in its own transaction. Append; never edit an applied one. */
const migrations = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, expires BIGINT NOT NULL);
   CREATE TABLE conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created BIGINT NOT NULL,
     state TEXT NOT NULL DEFAULT 'AI_ACTIVE', epoch INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE turns (conversation TEXT NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL,
     query TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, response TEXT, created BIGINT NOT NULL,
     epoch INTEGER NOT NULL DEFAULT 0, recording TEXT, seq BIGSERIAL, PRIMARY KEY (conversation, request));
   CREATE TABLE enquiries (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, value TEXT NOT NULL, seq BIGSERIAL);
   CREATE TABLE audio (id TEXT PRIMARY KEY, owner TEXT NOT NULL, bytes BYTEA NOT NULL, expires BIGINT NOT NULL);
   CREATE TABLE limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL);
   CREATE TABLE customer_preferences (owner TEXT PRIMARY KEY, current_conversation TEXT, reply_format TEXT NOT NULL DEFAULT 'match');
   CREATE TABLE human_messages (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, request TEXT NOT NULL UNIQUE, text TEXT NOT NULL, created BIGINT NOT NULL);
   CREATE TABLE order_drafts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL UNIQUE, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, reviewed_token TEXT);
   CREATE TABLE order_requests (id TEXT PRIMARY KEY, draft TEXT NOT NULL UNIQUE, conversation TEXT NOT NULL, value TEXT NOT NULL, seq BIGSERIAL);
   CREATE TABLE knowledge (id TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, seq BIGSERIAL);
   CREATE TABLE recordings (id TEXT PRIMARY KEY, owner TEXT NOT NULL, conversation TEXT NOT NULL, bytes BYTEA NOT NULL, mime TEXT NOT NULL,
     expires BIGINT NOT NULL, duration DOUBLE PRECISION);
   CREATE TABLE chat_users (id TEXT PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
     created BIGINT NOT NULL, expires BIGINT, active INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0, last_used BIGINT);
   CREATE UNIQUE INDEX chat_username ON chat_users (lower(username));
   CREATE TABLE chat_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires BIGINT NOT NULL);
   CREATE INDEX chat_session_user ON chat_sessions (user_id);
   CREATE INDEX turns_history ON turns (conversation, created);
   CREATE INDEX human_history ON human_messages (conversation, created);
   CREATE INDEX conversation_owner ON conversations (owner, created);`,
];

export async function migrate(connection: Runner & { transaction<T>(fn: (runner: Runner) => Promise<T>): Promise<T> }) {
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied BIGINT NOT NULL)');
  for (const [index, sql] of migrations.entries()) {
    const version = index + 1;
    await connection.transaction(async runner => {
      // Several server instances may start together; only one applies each migration.
      await runner.query('SELECT pg_advisory_xact_lock(46)');
      if ((await runner.query('SELECT version FROM schema_migrations WHERE version=$1', [version])).rows.length) return;
      for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await runner.query(statement);
      await runner.query('INSERT INTO schema_migrations VALUES ($1,$2)', [version, Date.now()]);
    });
  }
}
