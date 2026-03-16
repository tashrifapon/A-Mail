import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import { verifyBucketDescription } from '../../classifier/llmClassifier.js';
import styles from './BucketManager.module.css';

const BUCKET_COLORS = {
  'action required': 'var(--bucket-action)',
  'waiting on':      'var(--bucket-waiting)',
  'newsletter':      'var(--bucket-newsletter)',
  'transactions':    'var(--bucket-transactions)',
  'low priority':    'var(--bucket-low)',
};

function getBucketColor(name) {
  return BUCKET_COLORS[name?.toLowerCase()] || 'var(--bucket-custom)';
}

// ── Create Bucket Form ──────────────────────────────────────────────────────

function CreateBucketForm({ onCreated, config }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'verifying' | 'confirm'
  const [verification, setVerification] = useState(null); // { restatement, examples }
  const [error, setError] = useState('');
  const { state } = useApp();

  const nameExists = state.buckets.some(
    b => b.name.toLowerCase() === name.trim().toLowerCase()
  );

  async function handleVerify() {
    if (!name.trim() || !description.trim()) {
      setError('Both name and description are required.');
      return;
    }
    if (nameExists) {
      setError(`A bucket named "${name.trim()}" already exists.`);
      return;
    }
    setError('');
    setStep('verifying');
    try {
      const result = await verifyBucketDescription({ name: name.trim(), description: description.trim(), config });
      setVerification(result);
      setStep('confirm');
    } catch {
      setStep('form');
      setError('Could not verify with LLM. Check your LLM settings.');
    }
  }

  async function handleConfirm() {
    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: verification?.restatement || description.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to create bucket');
        setStep('form');
        return;
      }
      const bucket = await res.json();
      onCreated(bucket);
      setName(''); setDescription(''); setStep('form'); setVerification(null);
    } catch (err) {
      setError(err.message);
      setStep('form');
    }
  }

  if (step === 'verifying') {
    return (
      <div className={styles.verifying}>
        <div className={`animate-spin ${styles.spinner}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <span>Verifying with LLM…</span>
      </div>
    );
  }

  if (step === 'confirm' && verification) {
    return (
      <div className={styles.confirmStep}>
        <div className={styles.confirmHeader}>
          <span className={styles.confirmIcon}>🤖</span>
          <span className={styles.confirmTitle}>Here's what the AI understands</span>
        </div>

        <div className={styles.restatement}>
          <p className={styles.restatementText}>"{verification.restatement}"</p>
        </div>

        {verification.examples?.length > 0 && (
          <div className={styles.examples}>
            <p className={styles.examplesLabel}>Example emails that would qualify:</p>
            <ul className={styles.examplesList}>
              {verification.examples.map((ex, i) => (
                <li key={i} className={styles.exampleItem}>
                  <span className={styles.exampleDot}>·</span> {ex}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.confirmActions}>
          <button className={styles.backBtn} onClick={() => setStep('form')}>
            ← Edit description
          </button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            Looks right — create bucket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.createForm}>
      <h4 className={styles.createTitle}>New Bucket</h4>
      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input
          className={`${styles.input} ${nameExists ? styles.inputError : ''}`}
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          placeholder="e.g. Client Emails"
          maxLength={48}
        />
        {nameExists && <p className={styles.errorMsg}>This name is already taken.</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe what kinds of emails belong here. Be specific — this becomes the AI's rule. IMPORTANT: If you want emails here instead of a default bucket (e.g. Action Required, Transactions), explicitly state which default bucket(s) it should override."
          rows={4}
        />
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <button
        className={styles.verifyBtn}
        onClick={handleVerify}
        disabled={!name.trim() || !description.trim() || nameExists}
      >
        Verify with AI →
      </button>
    </div>
  );
}

// ── Bucket Row ──────────────────────────────────────────────────────────────
// Default buckets show no toggle — always on. Only custom buckets can be toggled.
// Deactivate/reactivate use dedicated server endpoints (no LLM calls).

const LOCKED_NAMES = new Set([
  'action required', 'waiting on / sent', 'newsletter', 'transactions', 'low priority'
]);

function BucketRow({ bucket, onUpdate, onDelete, onDeactivated, onReactivated }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bucket.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling, setToggling] = useState(false);

  const color = getBucketColor(bucket.name);
  const isLocked = bucket.is_default || LOCKED_NAMES.has(bucket.name.toLowerCase());

  async function handleToggleActive() {
    if (isLocked || toggling) return;
    setToggling(true);
    const wasActive = bucket.is_active;
    try {
      if (wasActive) {
        // Deactivate: server moves emails to their last_default_bucket_id (no LLM)
        const deactivateData = await fetch(`/api/buckets/${bucket.id}/deactivate`, { method: 'POST' }).then(r => r.json());
        const patchRes = await fetch(`/api/buckets/${bucket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: 0 }),
        });
        if (patchRes.ok) {
          onDeactivated?.(bucket.id, deactivateData.moved || []);
          onUpdate(await patchRes.json());
        }
      } else {
        // Reactivate: server snaps back emails whose previous_bucket_id = this bucket (no LLM)
        const reactivateData = await fetch(`/api/buckets/${bucket.id}/reactivate`, { method: 'POST' }).then(r => r.json());
        const patchRes = await fetch(`/api/buckets/${bucket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: 1 }),
        });
        if (patchRes.ok) {
          onReactivated?.(bucket.id, reactivateData.restored || []);
          onUpdate(await patchRes.json());
        }
      }
    } finally {
      setToggling(false);
    }
  }

  async function handleRename() {
    if (!name.trim() || name.trim() === bucket.name) { setEditing(false); return; }
    const res = await fetch(`/api/buckets/${bucket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) { onUpdate(await res.json()); setEditing(false); }
    else { const err = await res.json(); alert(err.error); setName(bucket.name); setEditing(false); }
  }

  async function handleDelete() {
    const res = await fetch(`/api/buckets/${bucket.id}`, { method: 'DELETE' });
    if (res.ok) onDelete(bucket.id);
    else { const err = await res.json(); alert(err.error); }
    setConfirmDelete(false);
  }

  return (
    <div className={`${styles.bucketRow} ${!bucket.is_active ? styles.inactive : ''}`}>
      <span className={styles.bucketDot} style={{ background: color }} />

      <div className={styles.bucketInfo}>
        {editing ? (
          <input
            className={styles.renameInput}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setName(bucket.name); setEditing(false); } }}
            autoFocus
          />
        ) : (
          <span className={styles.bucketName}>{bucket.name}</span>
        )}
        <span className={styles.bucketMeta}>
          {isLocked ? 'Default · Always on' : 'Custom'}
          {!bucket.is_active && ' · Hidden'}
        </span>
      </div>

      <div className={styles.bucketActions}>
        {/* Toggle only shown for custom (non-locked) buckets */}
        {!isLocked && (
          <button
            className={`${styles.toggleBtn} ${bucket.is_active ? styles.toggleOn : styles.toggleOff}`}
            onClick={handleToggleActive}
            disabled={toggling}
            title={bucket.is_active ? 'Hide bucket' : 'Show bucket'}
          >
            <span className={styles.toggleThumb} />
          </button>
        )}

        {/* Rename (custom only) */}
        {!bucket.is_default && (
          <button className={styles.rowIconBtn} onClick={() => setEditing(true)} title="Rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}

        {/* Delete (custom only) */}
        {!bucket.is_default && (
          confirmDelete ? (
            <div className={styles.deleteConfirm}>
              <span>Delete?</span>
              <button className={styles.deleteYes} onClick={handleDelete}>Yes</button>
              <button className={styles.deleteNo} onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          ) : (
            <button className={styles.rowIconBtn} onClick={() => setConfirmDelete(true)} title="Delete bucket">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Main BucketManager ──────────────────────────────────────────────────────

export default function BucketManager({ onBucketCreated, onBucketDeactivated, onBucketReactivated }) {
  const { state, dispatch } = useApp();

  const customCount = state.buckets.filter(b => !b.is_default).length;
  const atCustomCap = customCount >= 5;

  function handleCreated(bucket) {
    dispatch({ type: A.BUCKET_ADD, bucket });
    dispatch({ type: A.NOTIFY, notification: { type: 'success', message: `Bucket "${bucket.name}" created. Press Run to sort emails into it.` } });
    onBucketCreated?.(bucket);
  }

  function handleUpdate(bucket) {
    dispatch({ type: A.BUCKET_UPDATE, bucket });
  }

  function handleDelete(bucketId) {
    dispatch({ type: A.BUCKET_REMOVE, bucketId });
    dispatch({ type: A.NOTIFY, notification: { type: 'info', message: 'Bucket deleted.' } });
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && dispatch({ type: A.BUCKET_MANAGER_TOGGLE })}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Buckets</h2>
          <button className={styles.closeBtn} onClick={() => dispatch({ type: A.BUCKET_MANAGER_TOGGLE })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* Existing buckets */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              All Buckets
              {customCount > 0 && (
                <span className={styles.customCount}> · {customCount}/5 custom</span>
              )}
            </h3>
            <div className={styles.bucketList}>
              {state.buckets.map(bucket => (
                <BucketRow
                  key={bucket.id}
                  bucket={bucket}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onDeactivated={onBucketDeactivated}
                  onReactivated={onBucketReactivated}
                />
              ))}
            </div>
          </section>

          <div className={styles.divider} />

          {/* Create new — hidden if at cap */}
          <section className={styles.section}>
            {atCustomCap ? (
              <p className={styles.capWarning}>
                Custom bucket limit reached (5/5). Delete a custom bucket to create a new one.
              </p>
            ) : (
              <CreateBucketForm onCreated={handleCreated} config={state.config} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
