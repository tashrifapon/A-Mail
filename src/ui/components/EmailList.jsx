import { useState } from 'react';
import { useApp, useTabEmails } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import EmailCard from './EmailCard.jsx';
import EmailDetailModal from './EmailDetailModal.jsx';
import styles from './EmailList.module.css';

export default function EmailList({ onMove, onStar, onSetRead, onReply }) {
  const { state, dispatch } = useApp();
  const emails = useTabEmails();
  const [openEmail, setOpenEmail] = useState(null);

  const allIds = emails.map(e => e.threadId);
  const allSelected = allIds.length > 0 && allIds.every(id => state.selectedThreadIds.has(id));
  const someSelected = allIds.some(id => state.selectedThreadIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      dispatch({ type: A.SELECT_CLEAR });
    } else {
      dispatch({ type: A.SELECT_ALL, threadIds: allIds });
    }
  }

  // Open email detail — mark as read at this point (issue 3.1)
  function handleOpen(email) {
    setOpenEmail(email);
    if (!email.isRead) {
      onSetRead(email.threadId, true);
    }
  }

  if (emails.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
            <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7"/>
            <path d="M20 13H4l-2 8h20l-2-8z"/>
            <path d="M12 6v4M10 8h4"/>
          </svg>
        </div>
        <p className={styles.emptyTitle}>Nothing here</p>
        <p className={styles.emptySub}>
          {state.lastRun ? 'No emails in this bucket.' : 'Press Run to fetch your inbox.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.list}>
        {/* List header with select-all */}
        <div className={styles.listHeader}>
          <label className={styles.selectAllWrap}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={toggleSelectAll}
            />
          </label>
          <span className={styles.headerCount}>{emails.length} email{emails.length !== 1 ? 's' : ''}</span>
        </div>

        <div className={styles.scroll}>
          {emails.map((email, i) => (
            <EmailCard
              key={email.threadId}
              email={email}
              isSelected={state.selectedThreadIds.has(email.threadId)}
              isStarred={state.starredIds.has(email.threadId)}
              onSelect={() => dispatch({ type: A.SELECT_TOGGLE, threadId: email.threadId })}
              onMove={onMove}
              onStar={onStar}
              onSetRead={onSetRead}
              onReply={onReply}
              onOpen={handleOpen}
              style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
            />
          ))}
        </div>
      </div>

      {openEmail && (
        <EmailDetailModal
          email={openEmail}
          onClose={() => setOpenEmail(null)}
          onReply={onReply}
        />
      )}
    </>
  );
}
