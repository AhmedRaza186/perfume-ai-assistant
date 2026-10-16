import type { DatabaseSync } from 'node:sqlite';

/** Ordered transactional migrations. Existing settings and messages are preserved. */
export function migrate(connection: DatabaseSync) {
  connection.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)');
  const migrations = [
    `ALTER TABLE conversations ADD COLUMN state TEXT NOT NULL DEFAULT 'AI_ACTIVE';
     ALTER TABLE conversations ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0;
     ALTER TABLE turns ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0;
     CREATE TABLE customer_preferences (owner TEXT PRIMARY KEY, current_conversation TEXT, reply_format TEXT NOT NULL DEFAULT 'match');
     CREATE TABLE human_messages (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, request TEXT NOT NULL UNIQUE, text TEXT NOT NULL, created INTEGER NOT NULL);
     CREATE TABLE order_drafts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL UNIQUE, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, reviewed_token TEXT);
     CREATE TABLE order_requests (id TEXT PRIMARY KEY, draft TEXT NOT NULL UNIQUE, conversation TEXT NOT NULL, value TEXT NOT NULL);
     CREATE TABLE knowledge (id TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
     CREATE INDEX turns_history ON turns(conversation,created);
     CREATE INDEX human_history ON human_messages(conversation,created);
     CREATE INDEX conversation_owner ON conversations(owner,created);`,
    `CREATE TABLE recordings (id TEXT PRIMARY KEY, owner TEXT NOT NULL, conversation TEXT NOT NULL, bytes BLOB NOT NULL, mime TEXT NOT NULL, expires INTEGER NOT NULL, duration REAL);
     ALTER TABLE turns ADD COLUMN recording TEXT;`,
  ];
  migrations.forEach((sql, index) => {
    const version = index + 1;
    if (connection.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) return;
    connection.exec('BEGIN IMMEDIATE');
    try {
      connection.exec(sql);
      connection.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(version, Date.now());
      connection.exec('COMMIT');
    } catch (error) { connection.exec('ROLLBACK'); throw error; }
  });
}
