import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import styles from './EmailCard.module.css';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function EmailCard({ email, isSelected, isStarred, onSelect, onMove, onStar, onSetRead, onReply, onOpen, style }) {
  const { state } = useApp();
  const [moveOpen, setMoveOpen] = useState(false);

  const activeBuckets = state.buckets.filter(b => b.is_active && b.id !== email.bucketId);

  function handleMove(bucketId) {
    setMoveOpen(false);
    onMove(email, bucketId);
  }

  const isAutomated = ['newsletter', 'transactions'].some(
    name => state.buckets.find(b => b.id === email.bucketId)?.name?.toLowerCase() === name
  );

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${!email.isRead ? styles.unread : ''} animate-fade-in`}
      style={style}
    >
      {/* Unread indicator */}
      {!email.isRead && <div className={styles.unreadDot} />}

      {/* Select checkbox */}
      <label className={styles.checkWrap} onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={isSelected}
          onChange={onSelect}
        />
      </label>

      {/* Star */}
      <button
        className={`${styles.star} ${isStarred ? styles.starActive : ''}`}
        onClick={e => { e.stopPropagation(); onStar(email.threadId); }}
        title={isStarred ? 'Unstar' : 'Star'}
      >
        ★
      </button>

      {/* Main content — click opens the email detail view */}
      <div className={styles.main} onClick={() => onOpen(email)}>
        <div className={styles.row1}>
          <span className={styles.sender}>{email.sender}</span>
          <span className={styles.date}>{formatDate(email.date)}</span>
        </div>
        <div className={styles.row2}>
          <span className={styles.subject}>{email.subject}</span>
        </div>
        <div className={styles.row3}>
          <span className={styles.snippet}>{email.snippet}</span>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        {/* Read/Unread toggle */}
        <button
          className={styles.actionBtn}
          onClick={e => { e.stopPropagation(); onSetRead(email.threadId, !email.isRead); }}
          title={email.isRead ? 'Mark unread' : 'Mark read'}
        >
          {email.isRead
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          }
        </button>

        {/* Reply */}
        {!isAutomated && (
          <button
            className={styles.actionBtn}
            onClick={e => { e.stopPropagation(); onReply(email); }}
            title="Reply"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
        )}

        {/* Move dropdown */}
        <div className={styles.moveWrap}>
          <button
            className={styles.actionBtn}
            onClick={e => { e.stopPropagation(); setMoveOpen(p => !p); }}
            title="Move to bucket"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          {moveOpen && (
            <div className={styles.moveDropdown} onClick={e => e.stopPropagation()}>
              <div className={styles.dropdownLabel}>Move to</div>
              {activeBuckets.map(b => (
                <button key={b.id} className={styles.dropdownItem} onClick={() => handleMove(b.id)}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
