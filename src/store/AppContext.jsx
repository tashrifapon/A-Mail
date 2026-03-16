import { createContext, useContext, useReducer } from 'react';
import { appReducer, initialState } from './appReducer.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// ── Derived selectors ──────────────────────────────────────────────────────

/** Emails visible in the current active tab */
export function useTabEmails() {
  const { state } = useApp();
  const { emails, activeTabId, starredIds, buckets } = state;

  if (activeTabId === 'starred') {
    return emails
      .filter(e => starredIds.has(e.threadId))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const bucket = buckets.find(b => b.id === activeTabId);
  if (!bucket) return [];

  return emails
    .filter(e => e.bucketId === activeTabId)
    .sort((a, b) => {
      // Starred float to top within bucket
      const aStarred = starredIds.has(a.threadId) ? 0 : 1;
      const bStarred = starredIds.has(b.threadId) ? 0 : 1;
      if (aStarred !== bStarred) return aStarred - bStarred;
      return new Date(b.date) - new Date(a.date);
    });
}

/** Count of emails per bucket (for tab badges) */
// AFTER — unread only:
export function useBucketCounts() {
  const { state } = useApp();
  const counts = {};
  for (const email of state.emails) {
    if (!email.isRead) {
      counts[email.bucketId] = (counts[email.bucketId] || 0) + 1;
    }
  }
  counts['starred'] = state.starredIds.size;
  return counts;
}
