import { useEffect, useState } from 'react';
import { getCachedUser, hadActiveSession } from '../../auth/googleAuth.js';
import styles from './AuthScreen.module.css';

export default function AuthScreen({ onSignIn, config }) {
  const hasClientId = !!(config?.google_client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const [returningUser, setReturningUser] = useState(null);

  useEffect(() => {
    if (hadActiveSession()) {
      setReturningUser(getCachedUser());
    }
  }, []);

  return (
    <div className={styles.screen}>
      {/* Ambient background grid */}
      <div className={styles.grid} aria-hidden />

      <div className={styles.card}>
        <div className={styles.logoRow}>
          <span className={styles.logoMark}>A</span>
          <span className={styles.logoText}>-mail</span>
        </div>

        {returningUser ? (
          <>
            <h1 className={styles.headline}>
              Welcome back{returningUser.name ? `,` : '.'}<br />
              {returningUser.name && <em>{returningUser.name.split(' ')[0]}.</em>}
            </h1>
            <p className={styles.sub}>
              Signing you back in automatically…<br />
              Or click below if it takes too long.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.headline}>
              Your inbox,<br />
              <em>finally</em> sorted.
            </h1>
            <p className={styles.sub}>
              AI-powered triage that learns how you think.
              Runs entirely on your machine.
            </p>
          </>
        )}

        <button
          className={styles.signInBtn}
          onClick={onSignIn}
          disabled={!hasClientId}
        >
          <GoogleLogo />
          {returningUser ? 'Sign in again' : 'Sign in with Google'}
        </button>

        {!hasClientId && (
          <p className={styles.hint}>
            No Google Client ID found. Add <code>VITE_GOOGLE_CLIENT_ID</code> to your <code>.env</code> file
            or configure it in Settings after first launch.
          </p>
        )}

        <div className={styles.footer}>
          <span>Open source · Local LLMs · Your data stays yours</span>
        </div>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className={styles.googleIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
