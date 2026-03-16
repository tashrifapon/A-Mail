import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import styles from './BulkActionBar.module.css';

export default function BulkActionBar({ onBulkMove, onBulkRead }) {
  const { state, dispatch } = useApp();
  const [moveOpen, setMoveOpen] = useState(false);

  const count = state.selectedThreadIds.size;
  const activeBuckets = state.buckets.filter(b => b.is_active);

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <button
          className={styles.clearBtn}
          onClick={() => dispatch({ type: A.SELECT_CLEAR })}
          title="Clear selection"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <span className={styles.count}>
          {count} selected
        </span>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => onBulkRead(true)}
          title="Mark all as read"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Mark read
        </button>

        <button
          className={styles.actionBtn}
          onClick={() => onBulkRead(false)}
          title="Mark all as unread"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Mark unread
        </button>

        <div className={styles.moveWrap}>
          <button
            className={`${styles.actionBtn} ${styles.moveBtn}`}
            onClick={() => setMoveOpen(p => !p)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Move to
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {moveOpen && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownLabel}>Move {count} email{count !== 1 ? 's' : ''} to</div>
              {activeBuckets.map(b => (
                <button
                  key={b.id}
                  className={styles.dropdownItem}
                  onClick={() => { setMoveOpen(false); onBulkMove(b.id); }}
                >
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
