# A-mail

AI-powered email triage that runs entirely on your machine. Fetches your last 200 Gmail threads, classifies them into smart buckets using a local LLM, and gets smarter every time you move an email.

**Built with:** React · Vite · Express · SQLite · Ollama (Llama 3.2 3B) · Gmail API

---

## Features

- **Sign in with Google** — standard OAuth popup, stays signed in across relaunches
- **AI classification pipeline** — heuristic pre-pass (instant, free) + local LLM batches (parallel)
- **5 default buckets** — Action Required, Waiting On, Newsletter, Transactions, Low Priority
- **Custom buckets** — describe them in plain English, the AI verifies it understands
- **Self-improving** — move an email to correct the AI; after 10 corrections it reclassifies automatically
- **Starred emails** — float to top in their bucket, cross-bucket starred view
- **Compose & Reply** — AI drafts your reply based on the email's bucket context
- **Select all + bulk actions** — mark read/unread, move in bulk
- **Pluggable LLM** — Ollama (default), Anthropic, OpenAI, Groq

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Comes with Node |
| Ollama | latest | [ollama.com](https://ollama.com) — only needed for local LLM |
| A Google account | — | The one whose Gmail you want to triage |

---

## Setup: 1 — Install Ollama and pull the model

```bash
# Install Ollama (macOS)
brew install ollama

# Start the Ollama server
ollama serve

# In a new terminal, pull the model (≈2 GB download, one time only)
ollama pull llama3.2:3b
```

On Apple Silicon (M1–M4), Ollama uses Metal GPU acceleration automatically. Llama 3.2 3B runs at ~40–60 tokens/second — fast enough to classify 120 emails in about 8 seconds.

---

## Setup: 2 — Create a Google Cloud Project

This is required for Gmail access. It is free and takes about 5 minutes. You only do this once.

### 2a. Create the project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with the Google account you want to use
3. Click the project dropdown at the top → **New Project**
4. Name it `a-mail`, click **Create**
5. Make sure you're inside the new project (check the top dropdown)

### 2b. Enable the Gmail API

1. Go to **APIs & Services → Library**
2. Search for **Gmail API** → click it → click **Enable**

### 2c. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → click **Create**
3. Fill in:
   - App name: `A-mail`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through the Scopes screen (don't add anything)
5. On **Test Users**, click **Add Users** → add your own Gmail address
6. Click **Save and Continue** → **Back to Dashboard**

> The app stays in "Testing" mode. That's fine — it supports up to 100 test users without Google's verification process.

### 2d. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `A-mail Local`
5. Under **Authorized JavaScript origins**, click **Add URI**:
   ```
   http://localhost:5173
   ```
6. Leave **Authorized redirect URIs** empty
7. Click **Create**
8. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

---

## Setup: 3 — Configure the app

```bash
# Clone the repo
git clone https://github.com/yourusername/a-mail.git
cd a-mail

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env
```

Open `.env` and paste your Google Client ID:

```env
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

---

## Running the app

```bash
npm run dev
```

This starts both the React frontend (port 5173) and the Express backend (port 3001) simultaneously.

Open [http://localhost:5173](http://localhost:5173) in your browser.

1. Click **Sign in with Google** — sign in once, stay signed in
2. Click the **▶ Run** button in the top bar
3. Watch your inbox get fetched and classified in real time
4. Move emails to correct the AI — it learns

---

## Using a different LLM

Click the **⚙ Settings** icon in the top bar and switch the provider:

| Provider | What to fill in |
|----------|----------------|
| **Ollama** | Base URL: `http://localhost:11434`, Model: any pulled model name |
| **Anthropic** | API key from [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | API key from [platform.openai.com](https://platform.openai.com) |
| **Groq** | API key from [console.groq.com](https://console.groq.com) — free tier available |

Custom Ollama models (e.g. `phi4-mini`, `gemma3:4b`, `mistral:7b`):
```bash
ollama pull phi4-mini
# Then set model to "phi4-mini" in Settings
```

---

## Project structure

```
a-mail/
├── server/                   Express backend
│   ├── index.js              Server entry point (port 3001)
│   ├── db.js                 SQLite schema, triggers, seed data
│   └── routes/
│       ├── auth.js           Refresh token persistence
│       ├── buckets.js        Bucket CRUD
│       ├── corrections.js    Debounced learning signal writes
│       ├── config.js         LLM settings
│       ├── emails.js         Classification persistence
│       ├── runs.js           Run history
│       └── stars.js          Starred emails
├── src/
│   ├── auth/
│   │   └── googleAuth.js     Google GIS popup + silent refresh
│   ├── gmail/
│   │   └── gmailApi.js       Fetch threads, send, reply, read/unread
│   ├── classifier/
│   │   ├── heuristics.js     Free, instant: header + sender patterns
│   │   ├── llmClassifier.js  Adapters: Ollama, Anthropic, OpenAI, Groq
│   │   ├── pipeline.js       Phase 1 → Phase 2 orchestration
│   │   └── feedbackLoop.js   60s debounce, correction writes, threshold
│   ├── store/
│   │   ├── appReducer.js     All app state via useReducer
│   │   └── AppContext.jsx    Context + derived selectors
│   └── ui/
│       ├── screens/
│       │   ├── AuthScreen.jsx
│       │   └── InboxScreen.jsx
│       └── components/
│           ├── TopBar.jsx
│           ├── InboxTabs.jsx
│           ├── EmailList.jsx
│           ├── EmailCard.jsx
│           ├── BulkActionBar.jsx
│           ├── ComposeModal.jsx
│           ├── SettingsPanel.jsx
│           ├── BucketManager.jsx
│           └── Notification.jsx
├── data/                     SQLite database (gitignored)
├── .env                      Your credentials (gitignored)
├── .env.example              Template
└── README.md
```

---

## How classification works

```
200 emails fetched from Gmail
│
├── Phase 1 — Heuristic (free, ~0ms)
│   ├── List-Unsubscribe header → Newsletter
│   ├── no-reply / noreply / billing / alerts prefix → Transactions
│   └── Known domains (Amazon, Stripe, PayPal…) → Transactions
│   ~80 emails classified instantly
│
└── Phase 2 — LLM (Ollama / API)
    ├── Remaining ~120 emails split into batches of 40
    ├── 3 parallel API calls
    ├── Each prompt includes bucket definitions + your last 15 corrections
    └── Returns JSON: { threadId → bucketName }
    ~8 seconds total
```

**Self-improving:** Every time you move an email, a 60-second timer starts. If you move it again, the timer resets. When the timer expires, the final destination is written to the database as `belongs in [bucket]`. After 10 such corrections, the system automatically reclassifies Action Required and Waiting On emails using your corrections as examples.

---

## Database

All data lives in `data/amail.db` (created automatically, gitignored). Tables:

- `buckets` + `buckets_history` — bucket definitions and audit trail
- `email_classifications` + `email_classifications_history` — per-thread classification state
- `corrections` + `corrections_history` — user-confirmed placements (few-shot source)
- `config` + `config_history` — LLM settings
- `starred_emails` — starred thread IDs
- `run_history` — metadata for each Run
- `auth_tokens` — Google refresh token (single row)

To reset everything: `rm data/amail.db` — the app recreates it with defaults on next launch.

---

## Open source

MIT License. Every user brings their own Google Cloud project and LLM credentials. No shared keys, no shared quotas, no data leaves your machine (when using Ollama).

To contribute: open an issue or PR. The architecture notes in the code comments explain the design decisions.
