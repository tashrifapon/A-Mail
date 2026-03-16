import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/classifications', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const rows = db.prepare(`
    SELECT ec.thread_id, ec.bucket_id, ec.source, ec.classified_at, b.name as bucket_name
    FROM email_classifications ec
    LEFT JOIN buckets b ON b.id = ec.bucket_id
    WHERE ec.user_email = ?
  `).all(req.userEmail);
  res.json(rows);
});

router.post('/classifications/bulk', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { classifications } = req.body;
  if (!Array.isArray(classifications)) return res.status(400).json({ error: 'classifications must be an array' });

  const upsert = db.prepare(`
    INSERT INTO email_classifications (user_email, thread_id, bucket_id, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_email, thread_id) DO UPDATE SET
      bucket_id = excluded.bucket_id,
      source = excluded.source,
      classified_at = unixepoch()
  `);

  db.transaction(() => {
    for (const { thread_id, bucket_id, source } of classifications) {
      upsert.run(req.userEmail, thread_id, bucket_id, source);
    }
  })();

  res.json({ ok: true, count: classifications.length });
});

router.patch('/classifications/:threadId', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { threadId } = req.params;
  const { bucket_id, source } = req.body;
  if (!bucket_id) return res.status(400).json({ error: 'bucket_id required' });

  db.prepare(`
    INSERT INTO email_classifications (user_email, thread_id, bucket_id, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_email, thread_id) DO UPDATE SET
      bucket_id = excluded.bucket_id,
      source = excluded.source,
      classified_at = unixepoch()
  `).run(req.userEmail, threadId, bucket_id, source || 'user');

  res.json({ ok: true });
});

router.patch('/classifications/bulk-move', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { thread_ids, bucket_id, source } = req.body;
  if (!Array.isArray(thread_ids) || !bucket_id) {
    return res.status(400).json({ error: 'thread_ids array and bucket_id required' });
  }

  const update = db.prepare(`
    UPDATE email_classifications
    SET bucket_id = ?, source = ?, classified_at = unixepoch()
    WHERE user_email = ? AND thread_id = ?
  `);

  db.transaction(() => {
    for (const tid of thread_ids) update.run(bucket_id, source || 'user', req.userEmail, tid);
  })();

  res.json({ ok: true, moved: thread_ids.length });
});

router.get('/classifications/history', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT * FROM email_classifications_history
    WHERE user_email = ?
    ORDER BY changed_at DESC LIMIT ?
  `).all(req.userEmail, limit);
  res.json(rows);
});

export default router;
