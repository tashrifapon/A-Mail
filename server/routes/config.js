import { Router } from 'express';
import db, { ensureUserConfig } from '../db.js';

const router = Router();

// GET /api/config
// Always injects google_client_id from the server environment so it's never
// stored in the DB or exposed through the settings UI.
// If x-user-email is present, returns that user's persisted LLM settings too.
router.get('/', (req, res) => {
  const googleClientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    '';

  if (!req.userEmail) {
    // Boot call before sign-in — return just the global config
    return res.json({ google_client_id: googleClientId });
  }

  ensureUserConfig(req.userEmail);

  const rows = db.prepare('SELECT key, value FROM config WHERE user_email = ?').all(req.userEmail);
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  config.google_client_id = googleClientId; // always override from env
  res.json(config);
});

// PUT /api/config — bulk upsert for the signed-in user
router.put('/', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be a key-value object' });
  }

  // Never let the client overwrite the server-managed client ID
  delete updates.google_client_id;

  const upsert = db.prepare(`
    INSERT INTO config (user_email, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_email, key) DO UPDATE SET value = excluded.value
  `);

  db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(req.userEmail, key, String(value));
    }
  })();

  const rows = db.prepare('SELECT key, value FROM config WHERE user_email = ?').all(req.userEmail);
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  config.google_client_id = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  res.json(config);
});

router.get('/history', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const rows = db.prepare(
    'SELECT * FROM config_history WHERE user_email = ? ORDER BY changed_at DESC LIMIT 200'
  ).all(req.userEmail);
  res.json(rows);
});

export default router;
