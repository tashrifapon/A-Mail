import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/latest', (req, res) => {
  if (!req.userEmail) return res.json(null);
  const row = db.prepare(
    'SELECT * FROM run_history WHERE user_email = ? ORDER BY ran_at DESC LIMIT 1'
  ).get(req.userEmail);
  res.json(row || null);
});

router.get('/', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const rows = db.prepare(
    'SELECT * FROM run_history WHERE user_email = ? ORDER BY ran_at DESC LIMIT ?'
  ).all(req.userEmail, limit);
  res.json(rows);
});

router.post('/', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { email_count, heuristic_count, llm_count, new_count, llm_skipped } = req.body;
  if (email_count == null) return res.status(400).json({ error: 'email_count required' });

  const result = db.prepare(`
    INSERT INTO run_history (user_email, email_count, heuristic_count, llm_count, new_count, llm_skipped)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.userEmail, email_count || 0, heuristic_count || 0, llm_count || 0, new_count || 0, llm_skipped ? 1 : 0);

  const row = db.prepare('SELECT * FROM run_history WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

export default router;
