import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import db from './db.js';

import authRouter from './routes/auth.js';
import bucketsRouter from './routes/buckets.js';
import correctionsRouter from './routes/corrections.js';
import configRouter from './routes/config.js';
import runsRouter from './routes/runs.js';
import starsRouter from './routes/stars.js';
import emailsRouter from './routes/emails.js';
import cacheRouter from './routes/cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// ── User identity middleware ──────────────────────────────────────────────────
// Reads x-user-email header and attaches it as req.userEmail.
// Routes that need user isolation use req.userEmail.
// Routes that work without a user (e.g. GET /api/config for boot) handle null.
app.use('/api', (req, res, next) => {
  req.userEmail = (req.headers['x-user-email'] || '').trim().toLowerCase() || null;
  next();
});

// ── LLM Proxy — forwards all LLM requests server-side to avoid CORS ──────────
app.post('/api/llm/generate', async (req, res) => {
  const config = req.body.config || {};
  const payload = req.body.payload || {};
  const provider = config.llm_provider || 'anthropic';

  try {
    if (provider === 'anthropic') {
      const apiBase = config.llm_base_url?.replace(/\/$/, '') || 'https://api.anthropic.com';
      const response = await fetch(`${apiBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.llm_api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      res.json(data);
    } else {
      // OpenAI / Groq
      const apiBase = config.llm_base_url?.replace(/\/$/, '') || 'https://api.openai.com';
      const response = await fetch(`${apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.llm_api_key}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      res.json(data);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/buckets', bucketsRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/config', configRouter);
app.use('/api/runs', runsRouter);
app.use('/api/stars', starsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/cache', cacheRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve Vite build in production
import { existsSync } from 'fs';
import { join } from 'path';
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  A-mail server running at http://localhost:${PORT}\n`);
});
