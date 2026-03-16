import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const rows = db.prepare(
    'SELECT thread_id, starred_at FROM starred_emails WHERE user_email = ? ORDER BY starred_at DESC'
  ).all(req.userEmail);
  res.json(rows);
});

router.post('/:threadId', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  db.prepare(
    'INSERT INTO starred_emails (user_email, thread_id) VALUES (?,?) ON CONFLICT(user_email,thread_id) DO NOTHING'
  ).run(req.userEmail, req.params.threadId);
  res.json({ ok: true, starred: true });
});

router.delete('/:threadId', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  db.prepare('DELETE FROM starred_emails WHERE user_email = ? AND thread_id = ?').run(req.userEmail, req.params.threadId);
  res.json({ ok: true, starred: false });
});

export default router;
