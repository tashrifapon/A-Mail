// ── Initial State ──────────────────────────────────────────────────────────

export const initialState = {
  // Auth
  accessToken: null,
  userProfile: null,   // { email, name, picture }

  // App config (from server)
  config: {},          // { llm_provider, llm_base_url, llm_model, llm_api_key, google_client_id }

  // Buckets
  buckets: [],         // [{ id, name, description, is_default, is_active }]

  // Emails (in-memory, refreshed on Run)
  emails: [],          // [{ threadId, subject, sender, senderEmail, snippet, date, isRead, bucketId, source }]

  // Starred thread IDs
  starredIds: new Set(),

  // Run state
  isRunning: false,
  runProgress: null,   // { phase: 'fetching'|'heuristic'|'llm', done: 0, total: 0 }
  lastRun: null,       // { ran_at, email_count, heuristic_count, llm_count } — persists across sign-out
  sessionNewCount: null, // new emails found in THIS session's last run — resets on sign-out

  // UI
  activeTabId: null,   // bucket id, or 'starred'
  selectedThreadIds: new Set(),
  composeModal: null,  // { mode: 'compose'|'reply', to, subject, body, threadId, isLoadingDraft }
  settingsOpen: false,
  bucketManagerOpen: false,
  notification: null,  // { message, type: 'success'|'error'|'info', id }

  // Light Theme Default
  theme: localStorage.getItem('amail_theme') || 'light',
};

// ── Action Types ───────────────────────────────────────────────────────────

export const A = {
  // Auth
  AUTH_SUCCESS:         'AUTH_SUCCESS',
  AUTH_CLEAR:           'AUTH_CLEAR',
  USER_SWITCH:          'USER_SWITCH',   // hard-clear all user data before loading a new user

  // Config
  SET_CONFIG:           'SET_CONFIG',

  // Buckets
  SET_BUCKETS:          'SET_BUCKETS',
  BUCKET_ADD:           'BUCKET_ADD',
  BUCKET_UPDATE:        'BUCKET_UPDATE',
  BUCKET_REMOVE:        'BUCKET_REMOVE',

  // Run
  RUN_START:            'RUN_START',
  RUN_PROGRESS:         'RUN_PROGRESS',
  RUN_COMPLETE:         'RUN_COMPLETE',
  RUN_ERROR:            'RUN_ERROR',

  // Emails
  EMAILS_SET:           'EMAILS_SET',
  EMAIL_MOVE:           'EMAIL_MOVE',
  EMAIL_READ_SET:       'EMAIL_READ_SET',
  EMAILS_BULK_READ_SET: 'EMAILS_BULK_READ_SET',
  EMAILS_BULK_MOVE:     'EMAILS_BULK_MOVE',

  // Stars
  SET_STARRED_IDS:      'SET_STARRED_IDS',
  STAR_TOGGLE:          'STAR_TOGGLE',

  // Selection
  SELECT_TOGGLE:        'SELECT_TOGGLE',
  SELECT_ALL:           'SELECT_ALL',
  SELECT_CLEAR:         'SELECT_CLEAR',

  // Active tab
  SET_ACTIVE_TAB:       'SET_ACTIVE_TAB',

  // Compose/Reply modal
  COMPOSE_OPEN:         'COMPOSE_OPEN',
  COMPOSE_CLOSE:        'COMPOSE_CLOSE',
  COMPOSE_SET_DRAFT:    'COMPOSE_SET_DRAFT',
  COMPOSE_UPDATE_BODY:  'COMPOSE_UPDATE_BODY',

  // Panels
  SETTINGS_TOGGLE:      'SETTINGS_TOGGLE',
  BUCKET_MANAGER_TOGGLE: 'BUCKET_MANAGER_TOGGLE',

  // Notifications
  NOTIFY:               'NOTIFY',
  NOTIFY_CLEAR:         'NOTIFY_CLEAR',

  // Theme Toggle
  THEME_TOGGLE: 'THEME_TOGGLE',
};

// ── Reducer ────────────────────────────────────────────────────────────────

export function appReducer(state, action) {
  switch (action.type) {

    // ── Auth ──────────────────────────────────────────────────────────────
    case A.AUTH_SUCCESS:
      return { ...state, accessToken: action.accessToken, userProfile: action.userProfile };

    // Hard-clear all user-specific data when switching to a different account.
    // Unlike AUTH_CLEAR (which keeps emails visible after sign-out), this wipes
    // everything so User B never sees User A's data even for a moment.
    case A.USER_SWITCH:
      return {
        ...initialState,
        theme: state.theme, // preserve theme preference
        config: state.config, // config reloaded separately but keep during transition
      };

    case A.AUTH_CLEAR:
      return {
        ...state,
        accessToken: null,
        userProfile: null,
        // Keep emails + lastRun — they come from local SQLite and should
        // stay visible so the user sees their inbox even after sign-out.
        selectedThreadIds: new Set(),
        activeTabId: state.activeTabId,
        lastRun: state.lastRun,
        sessionNewCount: null, // reset: new-email count is only meaningful in the current session
      };

    // ── Config ────────────────────────────────────────────────────────────
    case A.SET_CONFIG:
      return { ...state, config: action.config };
    
    // Theme Toggle
    case A.THEME_TOGGLE: {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('amail_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { ...state, theme: next };
    }

    // ── Buckets ───────────────────────────────────────────────────────────
    case A.SET_BUCKETS: {
      const buckets = action.buckets;
      const activeTab = state.activeTabId;
      const stillActive = buckets.some(b => b.id === activeTab && b.is_active);
      const firstActive = buckets.find(b => b.is_active);
      return {
        ...state,
        buckets,
        activeTabId: stillActive ? activeTab : (firstActive?.id ?? 'starred'),
      };
    }

    case A.BUCKET_ADD:
      return { ...state, buckets: [...state.buckets, action.bucket] };

    case A.BUCKET_UPDATE:
      return {
        ...state,
        buckets: state.buckets.map(b => b.id === action.bucket.id ? action.bucket : b),
      };

    case A.BUCKET_REMOVE:
      return {
        ...state,
        buckets: state.buckets.filter(b => b.id !== action.bucketId),
      };

    // ── Run ───────────────────────────────────────────────────────────────
    case A.RUN_START:
      return {
        ...state,
        isRunning: true,
        runProgress: { phase: 'fetching', done: 0, total: 0 },
        selectedThreadIds: new Set(),
      };

    case A.RUN_PROGRESS:
      return { ...state, runProgress: action.progress };

    case A.RUN_COMPLETE:
      return {
        ...state,
        isRunning: false,
        runProgress: null,
        lastRun: action.lastRun,
        sessionNewCount: action.newCount ?? 0, // only set during an actual run
      };

    case A.RUN_ERROR:
      return { ...state, isRunning: false, runProgress: null };

    // ── Emails ────────────────────────────────────────────────────────────
    case A.EMAILS_SET: {
      const activeBuckets = state.buckets.filter(b => b.is_active);
      const defaultTabId = activeBuckets[0]?.id ?? 'starred';
      return {
        ...state,
        emails: action.emails,
        activeTabId: state.activeTabId ?? defaultTabId,
      };
    }

    case A.EMAIL_MOVE:
      return {
        ...state,
        emails: state.emails.map(e =>
          e.threadId === action.threadId
            ? { ...e, bucketId: action.bucketId, source: action.source || 'user' }
            : e
        ),
      };

    case A.EMAIL_READ_SET:
      return {
        ...state,
        emails: state.emails.map(e =>
          e.threadId === action.threadId ? { ...e, isRead: action.isRead } : e
        ),
      };

    case A.EMAILS_BULK_READ_SET:
      return {
        ...state,
        emails: state.emails.map(e =>
          action.threadIds.includes(e.threadId) ? { ...e, isRead: action.isRead } : e
        ),
      };

    case A.EMAILS_BULK_MOVE:
      // source must be 'user' — bulk moves are intentional user decisions,
      // same as single moves. 'llm' here was a bug that made bulk-moved
      // emails fair game for reclassification (overriding the user's intent).
      return {
        ...state,
        emails: state.emails.map(e =>
          action.threadIds.includes(e.threadId)
            ? { ...e, bucketId: action.bucketId, source: 'user' }
            : e
        ),
        selectedThreadIds: new Set(),
      };

    // ── Stars ─────────────────────────────────────────────────────────────
    case A.SET_STARRED_IDS:
      return { ...state, starredIds: new Set(action.ids) };

    case A.STAR_TOGGLE: {
      const next = new Set(state.starredIds);
      if (next.has(action.threadId)) next.delete(action.threadId);
      else next.add(action.threadId);
      return { ...state, starredIds: next };
    }

    // ── Selection ─────────────────────────────────────────────────────────
    case A.SELECT_TOGGLE: {
      const sel = new Set(state.selectedThreadIds);
      if (sel.has(action.threadId)) sel.delete(action.threadId);
      else sel.add(action.threadId);
      return { ...state, selectedThreadIds: sel };
    }

    case A.SELECT_ALL:
      return { ...state, selectedThreadIds: new Set(action.threadIds) };

    case A.SELECT_CLEAR:
      return { ...state, selectedThreadIds: new Set() };

    // ── Tab ───────────────────────────────────────────────────────────────
    case A.SET_ACTIVE_TAB:
      return { ...state, activeTabId: action.tabId, selectedThreadIds: new Set() };

    // ── Compose ───────────────────────────────────────────────────────────
    case A.COMPOSE_OPEN:
      return { ...state, composeModal: action.payload };

    case A.COMPOSE_CLOSE:
      return { ...state, composeModal: null };

    case A.COMPOSE_SET_DRAFT:
      return {
        ...state,
        composeModal: state.composeModal
          ? { ...state.composeModal, body: action.body, isLoadingDraft: false }
          : null,
      };

    case A.COMPOSE_UPDATE_BODY:
      return {
        ...state,
        composeModal: state.composeModal
          ? { ...state.composeModal, body: action.body }
          : null,
      };

    // ── Panels ────────────────────────────────────────────────────────────
    case A.SETTINGS_TOGGLE:
      return { ...state, settingsOpen: !state.settingsOpen, bucketManagerOpen: false };

    case A.BUCKET_MANAGER_TOGGLE:
      return { ...state, bucketManagerOpen: !state.bucketManagerOpen, settingsOpen: false };

    // ── Notifications ─────────────────────────────────────────────────────
    case A.NOTIFY:
      return { ...state, notification: action.notification };

    case A.NOTIFY_CLEAR:
      return { ...state, notification: null };

    default:
      return state;
  }
}
