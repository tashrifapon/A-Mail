import { useEffect, useCallback } from 'react';
import { AppProvider, useApp } from './store/AppContext.jsx';
import { A } from './store/appReducer.js';
import { setCurrentUser } from './api/apiFetch.js';
import { initGoogleAuth, requestToken, fetchUserProfile, cacheUser, getCachedUser, hadActiveSession, signOut, onSessionExpired } from './auth/googleAuth.js';
import AuthScreen from './ui/screens/AuthScreen.jsx';
import InboxScreen from './ui/screens/InboxScreen.jsx';
import Notification from './ui/components/Notification.jsx';
import styles from './App.module.css';

// Import once at module load — this installs the fetch interceptor
import './api/apiFetch.js';

function AppInner() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme || 'light');
  }, []);

  // ── Boot: config first, then confirm identity, then load user data ──────────
  useEffect(() => {
    async function boot() {
      try {
        // Step 1: config only — no user needed, provides google_client_id from env
        const configRes = await fetch('/api/config').then(r => r.json());
        dispatch({ type: A.SET_CONFIG, config: configRes });

        // Step 2: attempt silent sign-in BEFORE loading any cached user data.
        // We must confirm who the user is before making scoped DB reads —
        // otherwise the wrong user's data could appear if localStorage has a
        // stale email from a previous session.
        const clientId = configRes.google_client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID;
        let confirmedEmail = null;

        if (clientId && hadActiveSession()) {
          try {
            await initGoogleAuth(clientId);
            const token = await requestToken('silent');
            const profile = await fetchUserProfile(token);
            cacheUser(profile);

            // If a different account was silently restored, wipe any stale state
            const storedEmail = localStorage.getItem('amail_user_email') || '';
            if (profile.email !== storedEmail) {
              dispatch({ type: A.USER_SWITCH });
            }

            confirmedEmail = profile.email;
            setCurrentUser(confirmedEmail);
            dispatch({ type: A.AUTH_SUCCESS, accessToken: token, userProfile: profile });

            onSessionExpired(() => {
              dispatch({
                type: A.NOTIFY,
                notification: { type: 'error', message: 'Session expired — click Sign In to continue.' },
              });
              dispatch({ type: A.AUTH_SUCCESS, accessToken: null, userProfile: profile });
            });
          } catch {
            // Silent sign-in failed — clear any stale user, show sign-in screen
            setCurrentUser('');
          }
        }

        // Step 3: load user-specific data only for the confirmed user
        if (confirmedEmail) {
          const [bucketsRes, lastRunRes, cachedRes, starsRes] = await Promise.all([
            fetch('/api/buckets').then(r => r.json()),
            fetch('/api/runs/latest').then(r => r.json()),
            fetch('/api/cache').then(r => r.json()),
            fetch('/api/stars').then(r => r.json()),
          ]);

          dispatch({ type: A.SET_BUCKETS, buckets: bucketsRes });
          if (lastRunRes) dispatch({ type: A.RUN_COMPLETE, lastRun: lastRunRes });

          if (cachedRes.length > 0) {
            const emails = cachedRes.map(row => ({
              threadId: row.thread_id,
              subject: row.subject,
              sender: row.sender,
              senderEmail: row.sender_email,
              snippet: row.snippet,
              date: row.date,
              isRead: !!row.is_read,
              bucketId: row.bucket_id,
              source: row.source,
            }));
            dispatch({ type: A.EMAILS_SET, emails });
            const starredFromCache = cachedRes.filter(r => r.is_starred).map(r => r.thread_id);
            if (starredFromCache.length > 0) dispatch({ type: A.SET_STARRED_IDS, ids: starredFromCache });
          }
          dispatch({ type: A.SET_STARRED_IDS, ids: starsRes.map(s => s.thread_id) });
        }
      } catch (err) {
        console.error('Boot failed:', err);
      }
    }
    boot();
  }, []);

  useEffect(() => {
    if (!state.notification) return;
    const t = setTimeout(() => dispatch({ type: A.NOTIFY_CLEAR }), 4000);
    return () => clearTimeout(t);
  }, [state.notification]);

  const handleSignIn = useCallback(async () => {
    const clientId = state.config?.google_client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      dispatch({
        type: A.NOTIFY,
        notification: { type: 'error', message: 'Google Client ID not configured on server.' },
      });
      return;
    }

    try {
      await initGoogleAuth(clientId);
      const token = await requestToken('popup');
      const profile = await fetchUserProfile(token);
      cacheUser(profile);

      // Detect if this is a different user than whoever's data is currently in state.
      // If so, wipe all stale user-specific state BEFORE setting the new user —
      // this ensures User B never sees User A's emails even for a frame.
      const previousEmail = state.userProfile?.email || '';
      if (profile.email !== previousEmail) {
        dispatch({ type: A.USER_SWITCH });
      }

      setCurrentUser(profile.email); // re-scopes all subsequent API calls
      dispatch({ type: A.AUTH_SUCCESS, accessToken: token, userProfile: profile });

      // Always reload user-specific data fresh after sign-in.
      // This covers both new sign-ins and the case where boot pre-loaded
      // a different user's cached data from localStorage.
      const [bucketsRes, lastRunRes, cachedRes, starsRes] = await Promise.all([
        fetch('/api/buckets').then(r => r.json()),
        fetch('/api/runs/latest').then(r => r.json()),
        fetch('/api/cache').then(r => r.json()),
        fetch('/api/stars').then(r => r.json()),
      ]);

      dispatch({ type: A.SET_BUCKETS, buckets: bucketsRes });
      if (lastRunRes) dispatch({ type: A.RUN_COMPLETE, lastRun: lastRunRes });

      if (cachedRes.length > 0) {
        const emails = cachedRes.map(row => ({
          threadId: row.thread_id,
          subject: row.subject,
          sender: row.sender,
          senderEmail: row.sender_email,
          snippet: row.snippet,
          date: row.date,
          isRead: !!row.is_read,
          bucketId: row.bucket_id,
          source: row.source,
        }));
        dispatch({ type: A.EMAILS_SET, emails });

        const starredFromCache = cachedRes.filter(r => r.is_starred).map(r => r.thread_id);
        if (starredFromCache.length > 0) dispatch({ type: A.SET_STARRED_IDS, ids: starredFromCache });
      }

      dispatch({ type: A.SET_STARRED_IDS, ids: starsRes.map(s => s.thread_id) });

    } catch (err) {
      dispatch({ type: A.NOTIFY, notification: { type: 'error', message: `Sign-in failed: ${err.message}` } });
    }
  }, [state.config, state.userProfile]);

  const handleSignOut = useCallback(async () => {
    signOut(state.accessToken);
    await fetch('/api/auth/token', { method: 'DELETE' });
    setCurrentUser(''); // clear user — future API calls won't be scoped
    dispatch({ type: A.AUTH_CLEAR });
  }, [state.accessToken]);

  return (
    <div className={styles.app}>
      {state.accessToken
        ? <InboxScreen onSignOut={handleSignOut} />
        : <AuthScreen onSignIn={handleSignIn} config={state.config} />
      }
      {state.notification && <Notification />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
