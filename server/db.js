import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'amail.db');

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ─── Multi-user Schema Migration ───────────────────────────────────────────
const isSingleUserSchema = !db.pragma('table_info(cached_emails)')
  .some(c => c.name === 'user_email');

if (isSingleUserSchema) {
  console.log('  [db] Migrating to multi-user schema (v7→v8)…');
  db.exec(`
    DROP TABLE IF EXISTS cached_emails_history;
    DROP TABLE IF EXISTS cached_emails;
    DROP TABLE IF EXISTS email_classifications_history;
    DROP TABLE IF EXISTS email_classifications;
    DROP TABLE IF EXISTS buckets_history;
    DROP TABLE IF EXISTS buckets;
    DROP TABLE IF EXISTS config_history;
    DROP TABLE IF EXISTS config;
    DROP TABLE IF EXISTS corrections_history;
    DROP TABLE IF EXISTS corrections;
    DROP TABLE IF EXISTS starred_emails;
    DROP TABLE IF EXISTS run_history;
    DROP TABLE IF EXISTS auth_tokens;
  `);
  console.log('  [db] Old tables dropped. Fresh multi-user schema created.');
}

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS buckets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email  TEXT    NOT NULL DEFAULT '',
    name        TEXT    NOT NULL COLLATE NOCASE,
    description TEXT,
    is_default  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (user_email, name)
  );

  CREATE TABLE IF NOT EXISTS buckets_history (
    history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    operation   TEXT    NOT NULL,
    changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    id INTEGER, user_email TEXT, name TEXT, description TEXT,
    is_default INTEGER, is_active INTEGER, created_at INTEGER
  );

  CREATE TRIGGER IF NOT EXISTS buckets_ai AFTER INSERT ON buckets BEGIN
    INSERT INTO buckets_history (operation,id,user_email,name,description,is_default,is_active,created_at)
    VALUES ('INSERT',NEW.id,NEW.user_email,NEW.name,NEW.description,NEW.is_default,NEW.is_active,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS buckets_au AFTER UPDATE ON buckets BEGIN
    INSERT INTO buckets_history (operation,id,user_email,name,description,is_default,is_active,created_at)
    VALUES ('UPDATE',NEW.id,NEW.user_email,NEW.name,NEW.description,NEW.is_default,NEW.is_active,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS buckets_ad AFTER DELETE ON buckets BEGIN
    INSERT INTO buckets_history (operation,id,user_email,name,description,is_default,is_active,created_at)
    VALUES ('DELETE',OLD.id,OLD.user_email,OLD.name,OLD.description,OLD.is_default,OLD.is_active,OLD.created_at);
  END;

  CREATE TABLE IF NOT EXISTS email_classifications (
    user_email    TEXT    NOT NULL DEFAULT '',
    thread_id     TEXT    NOT NULL,
    bucket_id     INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    source        TEXT    NOT NULL DEFAULT 'llm',
    classified_at INTEGER NOT NULL DEFAULT (unixepoch()),
    previous_bucket_id     INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    last_default_bucket_id INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    PRIMARY KEY (user_email, thread_id)
  );

  CREATE TABLE IF NOT EXISTS email_classifications_history (
    history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    operation   TEXT    NOT NULL,
    changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    user_email TEXT, thread_id TEXT, bucket_id INTEGER, source TEXT, classified_at INTEGER
  );

  CREATE TRIGGER IF NOT EXISTS ec_ai AFTER INSERT ON email_classifications BEGIN
    INSERT INTO email_classifications_history (operation,user_email,thread_id,bucket_id,source,classified_at)
    VALUES ('INSERT',NEW.user_email,NEW.thread_id,NEW.bucket_id,NEW.source,NEW.classified_at);
  END;
  CREATE TRIGGER IF NOT EXISTS ec_au AFTER UPDATE ON email_classifications BEGIN
    INSERT INTO email_classifications_history (operation,user_email,thread_id,bucket_id,source,classified_at)
    VALUES ('UPDATE',NEW.user_email,NEW.thread_id,NEW.bucket_id,NEW.source,NEW.classified_at);
  END;
  CREATE TRIGGER IF NOT EXISTS ec_ad AFTER DELETE ON email_classifications BEGIN
    INSERT INTO email_classifications_history (operation,user_email,thread_id,bucket_id,source,classified_at)
    VALUES ('DELETE',OLD.user_email,OLD.thread_id,OLD.bucket_id,OLD.source,OLD.classified_at);
  END;

  CREATE TABLE IF NOT EXISTS corrections (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT    NOT NULL DEFAULT '',
    thread_id  TEXT    NOT NULL,
    sender     TEXT,
    subject    TEXT,
    snippet    TEXT,
    bucket_id  INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS corrections_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation  TEXT    NOT NULL,
    changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    id INTEGER, user_email TEXT, thread_id TEXT, sender TEXT,
    subject TEXT, snippet TEXT, bucket_id INTEGER, created_at INTEGER
  );

  CREATE TRIGGER IF NOT EXISTS corr_ai AFTER INSERT ON corrections BEGIN
    INSERT INTO corrections_history (operation,id,user_email,thread_id,sender,subject,snippet,bucket_id,created_at)
    VALUES ('INSERT',NEW.id,NEW.user_email,NEW.thread_id,NEW.sender,NEW.subject,NEW.snippet,NEW.bucket_id,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS corr_au AFTER UPDATE ON corrections BEGIN
    INSERT INTO corrections_history (operation,id,user_email,thread_id,sender,subject,snippet,bucket_id,created_at)
    VALUES ('UPDATE',NEW.id,NEW.user_email,NEW.thread_id,NEW.sender,NEW.subject,NEW.snippet,NEW.bucket_id,NEW.created_at);
  END;
  CREATE TRIGGER IF NOT EXISTS corr_ad AFTER DELETE ON corrections BEGIN
    INSERT INTO corrections_history (operation,id,user_email,thread_id,sender,subject,snippet,bucket_id,created_at)
    VALUES ('DELETE',OLD.id,OLD.user_email,OLD.thread_id,OLD.sender,OLD.subject,OLD.snippet,OLD.bucket_id,OLD.created_at);
  END;

  CREATE TABLE IF NOT EXISTS cached_emails (
    user_email             TEXT    NOT NULL DEFAULT '',
    thread_id              TEXT    NOT NULL,
    subject                TEXT,
    sender                 TEXT,
    sender_email           TEXT,
    snippet                TEXT,
    date                   TEXT,
    is_read                INTEGER DEFAULT 1,
    bucket_id              INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    source                 TEXT    NOT NULL DEFAULT 'llm',
    is_starred             INTEGER DEFAULT 0,
    fetched_at             INTEGER NOT NULL DEFAULT (unixepoch()),
    previous_bucket_id     INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    last_default_bucket_id INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
    PRIMARY KEY (user_email, thread_id)
  );

  CREATE TABLE IF NOT EXISTS cached_emails_history (
    history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    operation   TEXT    NOT NULL,
    changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    user_email TEXT, thread_id TEXT, subject TEXT, sender TEXT, sender_email TEXT,
    snippet TEXT, date TEXT, is_read INTEGER, bucket_id INTEGER,
    source TEXT, is_starred INTEGER, fetched_at INTEGER
  );

  CREATE TRIGGER IF NOT EXISTS ce_ai AFTER INSERT ON cached_emails BEGIN
    INSERT INTO cached_emails_history
      (operation,user_email,thread_id,subject,sender,sender_email,snippet,date,is_read,bucket_id,source,is_starred,fetched_at)
    VALUES
      ('INSERT',NEW.user_email,NEW.thread_id,NEW.subject,NEW.sender,NEW.sender_email,NEW.snippet,NEW.date,NEW.is_read,NEW.bucket_id,NEW.source,NEW.is_starred,NEW.fetched_at);
  END;
  CREATE TRIGGER IF NOT EXISTS ce_au AFTER UPDATE ON cached_emails BEGIN
    INSERT INTO cached_emails_history
      (operation,user_email,thread_id,subject,sender,sender_email,snippet,date,is_read,bucket_id,source,is_starred,fetched_at)
    VALUES
      ('UPDATE',NEW.user_email,NEW.thread_id,NEW.subject,NEW.sender,NEW.sender_email,NEW.snippet,NEW.date,NEW.is_read,NEW.bucket_id,NEW.source,NEW.is_starred,NEW.fetched_at);
  END;
  CREATE TRIGGER IF NOT EXISTS ce_ad AFTER DELETE ON cached_emails BEGIN
    INSERT INTO cached_emails_history
      (operation,user_email,thread_id,subject,sender,sender_email,snippet,date,is_read,bucket_id,source,is_starred,fetched_at)
    VALUES
      ('DELETE',OLD.user_email,OLD.thread_id,OLD.subject,OLD.sender,OLD.sender_email,OLD.snippet,OLD.date,OLD.is_read,OLD.bucket_id,OLD.source,OLD.is_starred,OLD.fetched_at);
  END;

  CREATE TABLE IF NOT EXISTS config (
    user_email TEXT NOT NULL DEFAULT '',
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    PRIMARY KEY (user_email, key)
  );

  CREATE TABLE IF NOT EXISTS config_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation  TEXT    NOT NULL,
    changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    user_email TEXT, key TEXT, value TEXT
  );

  CREATE TRIGGER IF NOT EXISTS config_ai AFTER INSERT ON config BEGIN
    INSERT INTO config_history (operation,user_email,key,value) VALUES ('INSERT',NEW.user_email,NEW.key,NEW.value);
  END;
  CREATE TRIGGER IF NOT EXISTS config_au AFTER UPDATE ON config BEGIN
    INSERT INTO config_history (operation,user_email,key,value) VALUES ('UPDATE',NEW.user_email,NEW.key,NEW.value);
  END;
  CREATE TRIGGER IF NOT EXISTS config_ad AFTER DELETE ON config BEGIN
    INSERT INTO config_history (operation,user_email,key,value) VALUES ('DELETE',OLD.user_email,OLD.key,OLD.value);
  END;

  CREATE TABLE IF NOT EXISTS starred_emails (
    user_email TEXT    NOT NULL DEFAULT '',
    thread_id  TEXT    NOT NULL,
    starred_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_email, thread_id)
  );

  CREATE TABLE IF NOT EXISTS run_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email       TEXT    NOT NULL DEFAULT '',
    ran_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    email_count      INTEGER NOT NULL DEFAULT 0,
    heuristic_count  INTEGER NOT NULL DEFAULT 0,
    llm_count        INTEGER NOT NULL DEFAULT 0,
    new_count        INTEGER NOT NULL DEFAULT 0,
    llm_skipped      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    user_email    TEXT    PRIMARY KEY,
    refresh_token TEXT    NOT NULL,
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

db.pragma('foreign_keys = ON');

// ─── Default bucket definitions ───────────────────────────────────────────

export const DEFAULT_BUCKETS = [
  {
    name: 'Action Required',
    description:
      'Emails where YOU must do something before this thread can move forward. ' +
      'Includes direct questions addressed to you, requests for your input or approval, ' +
      'deadlines, tasks assigned to you, meeting invites needing a response, and anything ' +
      'that will stall without your specific reply or action. ' +
      'Do NOT use for newsletters, receipts, automated notifications, or FYI emails.',
  },
  {
    name: 'Waiting On / Sent',
    description:
      'Emails where YOU are waiting for someone else to act or respond. ' +
      'Includes threads where you sent a message and expect a reply, ' +
      'emails confirming someone will get back to you, status updates you are tracking, ' +
      'and emails sent FROM your own address to others. ' +
      'The key signal: you have already acted and the ball is in someone else\'s court.',
  },
  {
    name: 'Newsletter',
    description:
      'Bulk-sent informational content you subscribed to. ' +
      'Includes newsletters, digests, industry updates, blog posts, product announcements, ' +
      'marketing emails, and any content sent to many recipients at once. ' +
      'Key signals: List-Unsubscribe header, sent to a list not personally to you, ' +
      'no direct question or request addressed to you specifically.',
  },
  {
    name: 'Transactions',
    description:
      'Automated emails about money, orders, accounts, or system events. ' +
      'Includes receipts, invoices, order confirmations, shipping notifications, ' +
      'delivery updates, billing statements, payment confirmations, bank alerts, ' +
      'account security notices, password resets, and service notifications. ' +
      'Key signals: dollar amounts, order numbers, tracking numbers, sent from no-reply addresses.',
  },
  {
    name: 'Low Priority',
    description:
      'Everything that does not clearly fit elsewhere and requires no action from you. ' +
      'Includes FYI emails, social notifications, read receipts, CC\'d threads ' +
      'where your input is not needed, general announcements, and anything that can wait indefinitely. ' +
      'This is the DEFAULT bucket — when genuinely uncertain, use this.',
  },
];

export const DEFAULT_CONFIG = {
  llm_provider:  'anthropic',
  llm_base_url:  'https://api.anthropic.com',
  llm_model:     'claude-haiku-4-5-20251001',
  llm_api_key:   '',
  llm_threshold: '30',
};

// ─── Per-user seeders (called from routes on first contact per user) ────────

const _insertBucket = db.prepare(
  `INSERT OR IGNORE INTO buckets (user_email, name, description, is_default) VALUES (?, ?, ?, 1)`
);
const _insertConfig = db.prepare(
  `INSERT INTO config (user_email, key, value) VALUES (?, ?, ?)
   ON CONFLICT(user_email, key) DO NOTHING`
);
const _updateBucketDesc = db.prepare(
  `UPDATE buckets SET description = ? WHERE user_email = ? AND name = ? AND is_default = 1`
);

export function ensureUserBuckets(userEmail) {
  const cnt = db.prepare('SELECT COUNT(*) as cnt FROM buckets WHERE user_email = ?').get(userEmail).cnt;
  if (cnt > 0) {
    // Refresh default bucket descriptions if they changed in code
    db.transaction(() => {
      for (const b of DEFAULT_BUCKETS) _updateBucketDesc.run(b.description, userEmail, b.name);
    })();
    return;
  }
  db.transaction(() => {
    for (const b of DEFAULT_BUCKETS) _insertBucket.run(userEmail, b.name, b.description);
  })();
}

export function ensureUserConfig(userEmail) {
  db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      _insertConfig.run(userEmail, key, String(value));
    }
  })();
}

export default db;
