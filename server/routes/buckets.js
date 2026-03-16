import { Router } from 'express';
import db, { ensureUserBuckets } from '../db.js';

const router = Router();

const LOCKED_BUCKET_NAMES = new Set([
  'action required',
  'waiting on / sent',
  'newsletter',
  'transactions',
  'low priority',
]);

const MAX_CUSTOM_BUCKETS = 5;

router.get('/', (req, res) => {
  if (!req.userEmail) return res.json([]);
  ensureUserBuckets(req.userEmail);
  const buckets = db.prepare(
    'SELECT * FROM buckets WHERE user_email = ? ORDER BY is_default DESC, id ASC'
  ).all(req.userEmail);
  res.json(buckets);
});

router.post('/', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const existing = db.prepare(
    'SELECT id FROM buckets WHERE user_email = ? AND name = ?'
  ).get(req.userEmail, name.trim());
  if (existing) return res.status(409).json({ error: `A bucket named "${name.trim()}" already exists` });

  const customCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM buckets WHERE user_email = ? AND is_default = 0'
  ).get(req.userEmail).cnt;
  if (customCount >= MAX_CUSTOM_BUCKETS) {
    return res.status(400).json({
      error: `Maximum of ${MAX_CUSTOM_BUCKETS} custom buckets allowed. Delete one before creating another.`,
    });
  }

  const result = db.prepare(
    'INSERT INTO buckets (user_email, name, description, is_default, is_active) VALUES (?, ?, ?, 0, 1)'
  ).run(req.userEmail, name.trim(), description || '');

  const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(bucket);
});

router.patch('/:id', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { id } = req.params;
  const { name, description, is_active } = req.body;

  const bucket = db.prepare(
    'SELECT * FROM buckets WHERE id = ? AND user_email = ?'
  ).get(id, req.userEmail);
  if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

  if (is_active !== undefined && LOCKED_BUCKET_NAMES.has(bucket.name.toLowerCase())) {
    return res.status(403).json({ error: `"${bucket.name}" is a default bucket and cannot be hidden.` });
  }

  if (is_active === 0) {
    const activeCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM buckets WHERE user_email = ? AND is_active = 1'
    ).get(req.userEmail).cnt;
    if (activeCount <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate the last active bucket' });
    }
  }

  if (name && name.trim() !== bucket.name) {
    const clash = db.prepare(
      'SELECT id FROM buckets WHERE user_email = ? AND name = ? AND id != ?'
    ).get(req.userEmail, name.trim(), id);
    if (clash) return res.status(409).json({ error: `A bucket named "${name.trim()}" already exists` });
  }

  db.prepare(`
    UPDATE buckets SET
      name        = COALESCE(?, name),
      description = COALESCE(?, description),
      is_active   = COALESCE(?, is_active)
    WHERE id = ? AND user_email = ?
  `).run(name?.trim() ?? null, description ?? null, is_active ?? null, id, req.userEmail);

  const updated = db.prepare('SELECT * FROM buckets WHERE id = ?').get(id);
  res.json(updated);
});

router.post('/:id/deactivate', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { id } = req.params;
  const bucket = db.prepare('SELECT * FROM buckets WHERE id = ? AND user_email = ?').get(id, req.userEmail);
  if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

  if (LOCKED_BUCKET_NAMES.has(bucket.name.toLowerCase())) {
    return res.status(403).json({ error: `"${bucket.name}" cannot be deactivated.` });
  }

  const lowPriority = db.prepare(
    `SELECT id FROM buckets WHERE user_email = ? AND name = 'Low Priority' AND is_active = 1`
  ).get(req.userEmail);
  const fallbackId = lowPriority?.id;

  const affected = db.prepare(
    'SELECT thread_id, last_default_bucket_id FROM cached_emails WHERE user_email = ? AND bucket_id = ?'
  ).all(req.userEmail, id);

  if (affected.length > 0) {
    const moveEmail = db.prepare(`
      UPDATE cached_emails SET
        previous_bucket_id = bucket_id,
        bucket_id          = COALESCE(last_default_bucket_id, ?)
      WHERE user_email = ? AND thread_id = ?
    `);
    db.transaction(() => {
      for (const row of affected) moveEmail.run(fallbackId, req.userEmail, row.thread_id);
    })();
  }

  const movedEmails = affected.length > 0
    ? db.prepare(
        `SELECT thread_id, bucket_id FROM cached_emails
         WHERE user_email = ? AND thread_id IN (${affected.map(() => '?').join(',')})`
      ).all(req.userEmail, ...affected.map(r => r.thread_id))
    : [];

  res.json({ ok: true, moved: movedEmails });
});

router.post('/:id/reactivate', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { id } = req.params;

  const toRestore = db.prepare(
    'SELECT thread_id FROM cached_emails WHERE user_email = ? AND previous_bucket_id = ?'
  ).all(req.userEmail, id);

  if (toRestore.length > 0) {
    const restore = db.prepare(`
      UPDATE cached_emails SET bucket_id = ?, previous_bucket_id = NULL
      WHERE user_email = ? AND thread_id = ?
    `);
    db.transaction(() => {
      for (const row of toRestore) restore.run(id, req.userEmail, row.thread_id);
    })();
  }

  res.json({ ok: true, restored: toRestore.map(r => r.thread_id) });
});

router.delete('/:id', (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: 'Sign in required' });

  const { id } = req.params;
  const bucket = db.prepare('SELECT * FROM buckets WHERE id = ? AND user_email = ?').get(id, req.userEmail);
  if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
  if (bucket.is_default) return res.status(403).json({ error: 'Default buckets cannot be deleted' });

  const activeCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM buckets WHERE user_email = ? AND is_active = 1'
  ).get(req.userEmail).cnt;
  if (bucket.is_active && activeCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last active bucket' });
  }

  db.prepare('DELETE FROM buckets WHERE id = ? AND user_email = ?').run(id, req.userEmail);
  res.json({ ok: true });
});

router.get('/history', (req, res) => {
  if (!req.userEmail) return res.json([]);
  const rows = db.prepare(
    'SELECT * FROM buckets_history WHERE user_email = ? ORDER BY changed_at DESC LIMIT 200'
  ).all(req.userEmail);
  res.json(rows);
});

export default router;
