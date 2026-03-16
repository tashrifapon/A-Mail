import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/token', (req, res) => {
  if (!req.userEmail) return res.json({ exists: false });
  const row = db.prepare('SELECT refresh_token, updated_at FROM auth_tokens WHERE user_email = ?').get(req.userEmail);
  res.json(row ? { exists: true, updated_at: row.updated_at } : { exists: false });
});

router.post('/token', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  db.prepare(`
    INSERT INTO auth_tokens (user_email, refresh_token, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(user_email) DO UPDATE SET refresh_token = excluded.refresh_token, updated_at = unixepoch()
  `).run(req.userEmail, refresh_token);
  res.json({ ok: true });
});

router.delete('/token', (req, res) => {
  if (!req.userEmail) return res.json({ ok: true });
  db.prepare('DELETE FROM auth_tokens WHERE user_email = ?').run(req.userEmail);
  res.json({ ok: true });
});

export default router;
