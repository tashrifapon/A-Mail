import { Router } from 'express';
import db from '../db.js';

const router = Router();
const ONE_WEEK = 7 * 24 * 60 * 60;

router.get('/', (req, res) => {
  if (!req.userEmail) return res.json([]);

  const cutoff = Math.floor(Date.now() / 1000) - ONE_WEEK;
  db.prepare('DELETE FROM cached_emails WHERE user_email = ? AND fetched_at < ?').run(req.userEmail, cutoff);

  const rows = db.prepare(`
    SELECT ce.*, b.name as bucket_name
    FROM cached_emails ce
    LEFT JOIN buckets b ON b.id = ce.bucket_id
    WHERE ce.user_email = ?
    ORDER BY ce.date DESC
  `).all(req.userEmail);
  res.json(rows);
});

router.post('/bulk', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { emails } = req.body;
  if (!Array.isArray(emails)) return res.status(400).json({ error: 'emails array required' });

  // Pre-fetch this user's default bucket IDs to compute last_default_bucket_id in JS
  const defaultIds = new Set(
    db.prepare('SELECT id FROM buckets WHERE user_email = ? AND is_default = 1').all(req.userEmail).map(r => r.id)
  );

  const upsert = db.prepare(`
    INSERT INTO cached_emails
      (user_email, thread_id, subject, sender, sender_email, snippet, date, is_read,
       bucket_id, source, last_default_bucket_id, fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,unixepoch())
    ON CONFLICT(user_email, thread_id) DO UPDATE SET
      subject      = excluded.subject,
      sender       = excluded.sender,
      sender_email = excluded.sender_email,
      snippet      = excluded.snippet,
      date         = excluded.date,
      is_read      = excluded.is_read,
      bucket_id    = CASE WHEN cached_emails.source = 'user'
                          THEN cached_emails.bucket_id
                          ELSE excluded.bucket_id END,
      source       = CASE WHEN cached_emails.source = 'user'
                          THEN 'user'
                          ELSE excluded.source END,
      last_default_bucket_id = CASE
        WHEN cached_emails.source != 'user'
          AND (SELECT is_default FROM buckets WHERE id = excluded.bucket_id) = 1
        THEN excluded.bucket_id
        ELSE cached_emails.last_default_bucket_id
      END,
      fetched_at   = unixepoch()
  `);

  db.transaction(() => {
    for (const e of emails) {
      const lastDefaultBucketId = defaultIds.has(e.bucketId) ? e.bucketId : null;
      upsert.run(
        req.userEmail, e.threadId, e.subject, e.sender, e.senderEmail,
        e.snippet, e.date, e.isRead ? 1 : 0, e.bucketId, e.source || 'llm',
        lastDefaultBucketId
      );
    }
  })();

  res.json({ ok: true, count: emails.length });
});

router.patch('/:threadId/read', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  const { is_read } = req.body;
  db.prepare('UPDATE cached_emails SET is_read = ? WHERE user_email = ? AND thread_id = ?')
    .run(is_read ? 1 : 0, req.userEmail, req.params.threadId);
  res.json({ ok: true });
});

router.patch('/:threadId/star', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  const { is_starred } = req.body;
  db.prepare('UPDATE cached_emails SET is_starred = ? WHERE user_email = ? AND thread_id = ?')
    .run(is_starred ? 1 : 0, req.userEmail, req.params.threadId);
  res.json({ ok: true });
});

router.patch('/:threadId/bucket', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { threadId } = req.params;
  const { bucket_id, source } = req.body;
  if (!bucket_id) return res.status(400).json({ error: 'bucket_id required' });

  const destBucket = db.prepare('SELECT is_default FROM buckets WHERE id = ? AND user_email = ?').get(bucket_id, req.userEmail);
  const isDefault = destBucket?.is_default === 1;

  db.prepare(`
    UPDATE cached_emails SET
      previous_bucket_id     = bucket_id,
      bucket_id              = ?,
      source                 = ?,
      last_default_bucket_id = CASE WHEN ? = 1 THEN ? ELSE last_default_bucket_id END
    WHERE user_email = ? AND thread_id = ?
  `).run(bucket_id, source || 'user', isDefault ? 1 : 0, bucket_id, req.userEmail, threadId);

  res.json({ ok: true });
});

router.patch('/bulk-read', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { thread_ids, is_read } = req.body;
  if (!Array.isArray(thread_ids)) return res.status(400).json({ error: 'thread_ids required' });

  const update = db.prepare('UPDATE cached_emails SET is_read = ? WHERE user_email = ? AND thread_id = ?');
  db.transaction(() => {
    for (const id of thread_ids) update.run(is_read ? 1 : 0, req.userEmail, id);
  })();
  res.json({ ok: true });
});

export default router;
