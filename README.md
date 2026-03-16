# A-mail

AI-powered email triage. Fetches your last 200 Gmail threads, classifies them into smart buckets using LLM of your choice, and gets smarter every time you move an email.

As if it's just A (1) Mail.

No more costly mistakes because you lost sight of an important email in a sea of unimportant ones.

**Built with:** React · Vite · Express · SQLite · Gmail API · and, of course, Claude 

---

## Features

- **Sign in with Google** — standard OAuth popup, stays signed in across relaunches
- **AI classification pipeline** — heuristic pre-pass (instant, free) + LLM batches
- **5 default buckets** — Action Required, Waiting On, Newsletter, Transactions, Low Priority
- **Custom buckets** — describe them in plain English, the AI then verifies it understands
- **Self-improving** — move an email to correct the AI; after an amount of corrections of your choice (default 30), on run, it reclassifies automatically
- **Starred emails** — float to top in their bucket, cross-bucket starred view
- **View, Compose & + AI-Assisted Reply** — no need to leave the app at all, defeats the purpose via poor functionality
- **Select all + bulk actions** — mark read/unread, move in bulk
- **Pluggable LLM** — Anthropic, OpenAI, Groq (plug-in taken care of, just name your model and paste your key!)

---

## Links
- [**YouTube Demo**](https://youtube.com/)
- [**Live Site**](https://a-mail.onrender.com/) - No need for the rest below, enjoy! Exception: Google API is in testing mode, so contact me at tashrifapon2001@gmail.com if you are not a test user.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Comes with Node |
| Google account(s) | — | The Gmail(s) you want to triage |

---

## Setup: 1 — Create a Google Cloud Project (for local (on your machine) deployment only)

The live/deployed website already has this taken care of. Please contact me if you want access: tashrifapon2001@gmail.com

This is required for Gmail access. It is free and takes about 5 minutes. You only do this once.

### 1a. Create the project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with the Google account you want to use
3. Click the project dropdown at the top → **New Project**
4. Name it something in line with Google's rules, click **Create**
5. Make sure you're inside the new project (check the top dropdown)

### 1b. Enable the Gmail API

1. Go to **APIs & Services → Library**
2. Search for **Gmail API** → click it → click **Enable**

### 1c. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → click **Create**
3. Fill in:
   - App name: your choice
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through the Scopes screen (don't add anything)
5. On **Test Users**, click **Add Users** → add your own Gmail address and any others you want (and have access to)
6. Click **Save and Continue** → **Back to Dashboard**

> The app stays in "Testing" mode. That's fine — it supports up to 100 test users without Google's verification process.

### 1d. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: your choice - best to stay consistent with your naming
5. Under **Authorized JavaScript origins**, click **Add URI**:
   ```
   http://localhost:5173
   ```
6. Leave **Authorized redirect URIs** empty - unless you plan to deploy it live, then you'll need to add that URI
7. Click **Create**
8. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

---

## Setup: 2 — Configure the app

```bash
# Clone the repo
git clone https://github.com/tashrifapon/a-mail.git
cd a-mail

# Install dependencies
npm install

# Make a dotenv (.env)
```

Open `.env` and paste your Google Client ID:

```env
VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com

GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
```

---

## Running the app

```bash
npm run dev
```

This starts both the React frontend (port 5173) and the Express backend (port 3001) simultaneously.

Open [http://localhost:5173](http://localhost:5173) in your browser (nice tip: click on it while holding the command/ctrl button).

1. Click **Sign in with Google** — sign in once, stay signed in
2. Make sure you enter your API Key and set a Reclassification minimum threshold (if 30, then 30 new emails must be fetched to
run the pipeline; set to 0 if you always want it to activate when you do the next step and have no regard for money) 
4. Click the **▶ Run** button in the top bar
5. Watch your inbox get fetched and classified in real time
6. Move emails to correct the AI — it learns

---

## Using a different LLM

Click the **⚙ Settings** icon in the top bar and switch the provider:

| Provider | What to fill in |
|----------|----------------|
| **Ollama** | Base URL: `http://localhost:11434`, Model: any pulled model name |
| **Anthropic** | API key from [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | API key from [platform.openai.com](https://platform.openai.com) |
| **Groq** | API key from [console.groq.com](https://console.groq.com) — free tier available |

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
│   │   ├── llmClassifier.js  Adapters: Anthropic, OpenAI, Groq
│   │   ├── pipeline.js       Phase 1 → Phase 2 orchestration
│   │   └── feedbackLoop.js   Correction writes, threshold
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
│   ~80 emails classified instantly (~40% in savings and increased performance)
│
└── Phase 2 — LLM (Ollama / API)
    ├── Remaining ~120 emails split into batches of 40
    ├── 3 parallel API calls
    ├── Each prompt includes bucket definitions + your last 20 corrections -> aka few shots prompting method
    └── Returns JSON: { threadId → bucketName }
    ~8 seconds total
```

**Self-improving:** Done by your moves of emails which are saved to the database and the 20 most recent moves are called for few shot prompting. This improves it overall, but it focuses on recent actions by you, which is amazing.

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
