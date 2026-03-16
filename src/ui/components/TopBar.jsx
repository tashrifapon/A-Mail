import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import styles from './TopBar.module.css';
import { useState } from 'react';

function formatRunTime(unixSecs) {
  if (!unixSecs) return '';
  const d = new Date(unixSecs * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RunProgress({ progress }) {
  if (!progress) return null;
  const labels = {
    fetching: 'Fetching emails',
    heuristic: 'Sorting',
    llm: 'Classifying',
  };
  const label = labels[progress.phase] || 'Working';
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.progressLabel}>{label}… {progress.done}/{progress.total}</span>
    </div>
  );
}

export default function TopBar({ onRun, onCompose, onSignOut }) {
  const { state, dispatch } = useApp();
  const { isRunning, runProgress, lastRun, sessionNewCount, userProfile } = state;
  const [avatarOpen, setAvatarOpen] = useState(false);

  return (
    <header className={styles.topbar}>
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandA}>A</span>
        <span className={styles.brandDash}>-mail</span>
      </div>

      {/* Center — run status */}
      <div className={styles.center}>
        {isRunning ? (
          <RunProgress progress={runProgress} />
        ) : lastRun ? (
          <span className={styles.lastRun}>
            {`Last run ${formatRunTime(lastRun.ran_at)} · ${sessionNewCount ?? 0} new emails`}
          </span>
        ) : (
          <span className={styles.lastRun}>Run to fetch &amp; sort your inbox</span>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`${styles.runBtn} ${isRunning ? styles.running : ''}`}
          onClick={onRun}
          disabled={isRunning}
          title="Fetch and classify inbox"
        >
          {isRunning ? (
            <svg className={`${styles.icon} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          )}
          {isRunning ? 'Running…' : 'Run'}
        </button>

        <button className={styles.composeBtn} onClick={onCompose} title="Compose new email">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
            <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.375-9.375z"/>
          </svg>
          Compose
        </button>

        <div className={styles.divider} />
        
        {/* Add this button in the actions div, before the settings iconBtn: */}
        <button
          className={styles.iconBtn}
          onClick={() => dispatch({ type: A.THEME_TOGGLE })}
          title={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {state.theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        <button
          className={styles.iconBtn}
          onClick={() => dispatch({ type: A.BUCKET_MANAGER_TOGGLE })}
          title="Manage buckets"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <path d="M4 6h16M4 12h16M4 18h7"/>
            <circle cx="17" cy="18" r="3"/>
            <path d="M17 15v3l2 1"/>
          </svg>
        </button>

        <button
          className={styles.iconBtn}
          onClick={() => dispatch({ type: A.SETTINGS_TOGGLE })}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {userProfile && (
          <div className={styles.avatarWrap}>
            <button
              className={styles.avatarBtn}
              onClick={() => setAvatarOpen(p => !p)}
            >
              {userProfile.picture
                ? <img src={userProfile.picture} alt={userProfile.name} className={styles.avatar} />
                : <span className={styles.avatarInitial}>{userProfile.name?.[0] || '?'}</span>
              }
            </button>
            {avatarOpen && (
              <div className={styles.avatarDropdown}>
                <span className={styles.avatarEmail}>{userProfile.email}</span>
                <button className={styles.signOutBtn} onClick={() => { setAvatarOpen(false); onSignOut(); }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
