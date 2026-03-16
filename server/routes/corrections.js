import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.post('/', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { thread_id, sender, subject, snippet, bucket_id } = req.body;
  if (!thread_id || !bucket_id) return res.status(400).json({ error: 'thread_id and bucket_id are required' });

  const existing = db.prepare(
    'SELECT id FROM corrections WHERE user_email = ? AND thread_id = ?'
  ).get(req.userEmail, thread_id);

  if (existing) {
    db.prepare(`
      UPDATE corrections
      SET sender = ?, subject = ?, snippet = ?, bucket_id = ?, created_at = unixepoch()
      WHERE user_email = ? AND thread_id = ?
    `).run(sender, subject, snippet, bucket_id, req.userEmail, thread_id);
  } else {
    db.prepare(
      'INSERT INTO corrections (user_email, thread_id, sender, subject, snippet, bucket_id) VALUES (?,?,?,?,?,?)'
    ).run(req.userEmail, thread_id, sender, subject, snippet, bucket_id);
  }

  const count = db.prepare('SELECT COUNT(*) as cnt FROM corrections WHERE user_email = ?').get(req.userEmail).cnt;
  res.json({ ok: true, total_corrections: count });
});

router.get('/recent', (req, res) => {
  if (!req.userEmail) return res.json([]);

  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  const rows = db.prepare(`
    SELECT c.thread_id, c.sender, c.subject, c.snippet, b.name as bucket_name
    FROM corrections c
    LEFT JOIN buckets b ON b.id = c.bucket_id
    WHERE c.user_email = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(req.userEmail, limit);
  res.json(rows);
});

router.get('/count', (req, res) => {
  if (!req.userEmail) return res.json({ count: 0 });
  const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM corrections WHERE user_email = ?').get(req.userEmail);
  res.json({ count: cnt });
});

router.delete('/prune', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  const days = parseInt(req.query.days) || 90;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const result = db.prepare('DELETE FROM corrections WHERE user_email = ? AND created_at < ?').run(req.userEmail, cutoff);
  res.json({ deleted: result.changes });
});

export default router;
