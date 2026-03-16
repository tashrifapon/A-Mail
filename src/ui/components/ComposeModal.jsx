import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import styles from './ComposeModal.module.css';

export default function ComposeModal({ onSend, onClose }) {
  const { state, dispatch } = useApp();
  const modal = state.composeModal;
  if (!modal) return null;

  const isReply = modal.mode === 'reply';
  const isAutomated = ['newsletter', 'transactions'].some(
    name => state.buckets.find(b => b.id === state.emails?.find(e => e.threadId === modal.threadId)?.bucketId)?.name?.toLowerCase() === name
  );

  function updateField(field, value) {
    dispatch({ type: A.COMPOSE_UPDATE_BODY, body: field === 'body' ? value : modal.body });
    if (field !== 'body') {
      dispatch({
        type: A.COMPOSE_OPEN,
        payload: { ...modal, [field]: value },
      });
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSend();
    }
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>
            {isReply ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                  <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
                Reply to {modal.to}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                  <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.375-9.375z"/>
                </svg>
                New Message
              </>
            )}
          </span>
          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className={styles.fields}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>To</label>
            <input
              className={styles.fieldInput}
              type="email"
              value={modal.to}
              onChange={e => updateField('to', e.target.value)}
              placeholder="recipient@example.com"
              autoFocus={!isReply}
              readOnly={isReply}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Subject</label>
            <input
              className={styles.fieldInput}
              type="text"
              value={isReply ? (modal.subject.startsWith('Re:') ? modal.subject : `Re: ${modal.subject}`) : modal.subject}
              onChange={e => updateField('subject', e.target.value)}
              placeholder="Subject"
              readOnly={isReply}
            />
          </div>

          <div className={styles.divider} />

          {/* Body */}
          <div className={styles.bodyWrap}>
            {modal.isLoadingDraft ? (
              <div className={styles.draftLoading}>
                <div className={`animate-spin ${styles.spinner}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                </div>
                <span>Drafting reply…</span>
              </div>
            ) : (
              <>
                {isReply && modal.body && (
                  <div className={styles.draftLabel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v4l3 3"/>
                    </svg>
                    AI-suggested draft — edit before sending
                  </div>
                )}
                <textarea
                  className={styles.bodyInput}
                  value={modal.body}
                  onChange={e => dispatch({ type: A.COMPOSE_UPDATE_BODY, body: e.target.value })}
                  placeholder={isReply ? 'Write your reply…' : 'Write your message…'}
                  autoFocus={isReply}
                />
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.shortcut}>
            <kbd>⌘</kbd><kbd>↵</kbd> to send
          </span>
          <div className={styles.footerActions}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button
              className={styles.sendBtn}
              onClick={onSend}
              disabled={!modal.to || !modal.body || modal.isLoadingDraft}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
