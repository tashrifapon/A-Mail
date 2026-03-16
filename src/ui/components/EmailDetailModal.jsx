import { useEffect, useState } from 'react';
import { getAccessToken } from '../../auth/googleAuth.js';
import styles from './EmailDetailModal.module.css';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function fetchFullBody(threadId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch email body');
  const data = await res.json();

  // Walk the message parts to find the best text content
  function extractBody(payload) {
    if (!payload) return '';
    // Prefer text/html, fall back to text/plain
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return { html: atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/')) };
    }
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return { plain: atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/')) };
    }
    if (payload.parts) {
      let plain = '';
      let html = '';
      for (const part of payload.parts) {
        const result = extractBody(part);
        if (result?.html) html = result.html;
        else if (result?.plain) plain = result.plain;
      }
      if (html) return { html };
      if (plain) return { plain };
    }
    return '';
  }

  // Use the last message in the thread for display
  const messages = data.messages || [];
  const msg = messages[messages.length - 1];
  const body = extractBody(msg?.payload);
  return body;
}

export default function EmailDetailModal({ email, onClose, onReply }) {
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFullBody(email.threadId);
        if (!cancelled) setBody(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [email.threadId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <h2 className={styles.subject}>{email.subject}</h2>
            <div className={styles.fromRow}>
              <span className={styles.fromLabel}>From:</span>
              <span className={styles.fromValue}>{email.sender}</span>
              {email.senderEmail && email.senderEmail !== email.sender && (
                <span className={styles.fromEmail}>&lt;{email.senderEmail}&gt;</span>
              )}
            </div>
            <div className={styles.dateRow}>
              {new Date(email.date).toLocaleString([], {
                weekday: 'short', month: 'short', day: 'numeric',
                year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
          <div className={styles.headerActions}>
            {onReply && (
              <button className={styles.replyBtn} onClick={() => { onReply(email); onClose(); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="9 17 4 12 9 7"/>
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
                Reply
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              Loading email…
            </div>
          )}
          {error && <div className={styles.error}>Failed to load email: {error}</div>}
          {!loading && !error && body && (
            body.html
              ? <iframe
                  className={styles.iframe}
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #222; word-break: break-word; }
                    img { max-width: 100%; height: auto; }
                    a { color: #1a73e8; }
                    blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding-left: 12px; color: #555; }
                    pre, code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
                  </style></head><body>${body.html}</body></html>`}
                  sandbox="allow-same-origin"
                  title="Email content"
                />
              : <pre className={styles.plainText}>{body.plain || '(no content)'}</pre>
          )}
          {!loading && !error && !body && (
            <div className={styles.snippet}>
              <p>{email.snippet}</p>
              <p className={styles.snippetNote}>(Full content unavailable)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
