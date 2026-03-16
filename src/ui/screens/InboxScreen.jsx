import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import { fetchInboxThreads, setThreadRead, batchSetRead, sendEmail, replyToThread } from '../../gmail/gmailApi.js';
import { runClassificationPipeline } from '../../classifier/pipeline.js';
import { runHeuristics } from '../../classifier/heuristics.js';
import { fetchRecentCorrections, registerMove, onReclassifyThreshold } from '../../classifier/feedbackLoop.js';
import { generateReplyDraft } from '../../classifier/llmClassifier.js';
import TopBar from '../components/TopBar.jsx';
import InboxTabs from '../components/InboxTabs.jsx';
import EmailList from '../components/EmailList.jsx';
import BulkActionBar from '../components/BulkActionBar.jsx';
import ComposeModal from '../components/ComposeModal.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import BucketManager from '../components/BucketManager.jsx';
import styles from './InboxScreen.module.css';

export default function InboxScreen({ onSignOut }) {
  const { state, dispatch } = useApp();

  // ── Keep a ref to latest state for callbacks that must not go stale ────────
  const latestState = useRef(state);
  useEffect(() => { latestState.current = state; }, [state]);

  // ── Run pipeline ───────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (state.isRunning) return;
    dispatch({ type: A.RUN_START });

    try {
      // Fetch emails from Gmail
      const rawEmails = await fetchInboxThreads(200, (progress) => {
        dispatch({ type: A.RUN_PROGRESS, progress });
      });

      // Count how many are new vs already cached
      const existingIds = new Set(state.emails.map(e => e.threadId));
      const newEmailCount = rawEmails.filter(e => !existingIds.has(e.threadId)).length;

      // ── Threshold check — skip LLM if too few new emails ──────────────────
      // llm_threshold = 0 means always run LLM.
      const threshold = parseInt(state.config.llm_threshold ?? '30');
      const skipLLM = threshold > 0 && newEmailCount < threshold;

      // Load corrections for few-shot (only needed for LLM path)
      const corrections = skipLLM ? [] : await fetchRecentCorrections(20);

      const userEmail = state.userProfile?.email || '';
      const existingEmailMap = new Map(state.emails.map(e => [e.threadId, e]));
      const activeBuckets = state.buckets.filter(b => b.is_active);
      const lowPriority = activeBuckets.find(b => b.name.toLowerCase() === 'low priority');

      let results;

      if (skipLLM) {
        // Heuristics only — no LLM API call.
        // Emails heuristics can't classify keep their existing cached bucket
        // (or fall back to Low Priority for genuinely new unseen emails).
        dispatch({ type: A.RUN_PROGRESS, progress: { phase: 'heuristic', done: 0, total: rawEmails.length } });
        const { heuristicResults, unclaimed } = runHeuristics(rawEmails, activeBuckets);
        dispatch({ type: A.RUN_PROGRESS, progress: { phase: 'heuristic', done: rawEmails.length - unclaimed.length, total: rawEmails.length } });

        const unclaimedFilled = unclaimed.map(email => {
          const existing = existingEmailMap.get(email.threadId);
          return {
            threadId: email.threadId,
            bucketId: existing?.bucketId ?? lowPriority?.id,
            bucketName: existing ? undefined : (lowPriority?.name || 'Low Priority'),
            source: existing?.source ?? 'llm',
          };
        });
        results = [...heuristicResults, ...unclaimedFilled];

        dispatch({
          type: A.NOTIFY,
          notification: {
            type: 'info',
            message: `${newEmailCount} new email${newEmailCount !== 1 ? 's' : ''} (below threshold of ${threshold}) — heuristics applied, LLM skipped.`,
          },
        });
      } else {
        // Full pipeline: heuristics + LLM
        results = await runClassificationPipeline(
          rawEmails,
          state.buckets,
          corrections,
          state.config,
          (progress) => dispatch({ type: A.RUN_PROGRESS, progress }),
          userEmail
        );
      }

      // Merge classification results — preserve 'user' source for manually moved emails
      const resultMap = new Map(results.map(r => [r.threadId, r]));

      const classified = rawEmails.map(email => {
        const existing = existingEmailMap.get(email.threadId);
        const isRead = existing != null ? existing.isRead : email.isRead;
        if (existing?.source === 'user') {
          return { ...email, isRead, bucketId: existing.bucketId, source: 'user' };
        }
        return {
          ...email,
          isRead,
          bucketId: resultMap.get(email.threadId)?.bucketId,
          source: resultMap.get(email.threadId)?.source || 'llm',
        };
      });

      dispatch({ type: A.EMAILS_SET, emails: classified });

      await fetch('/api/cache/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: classified }),
      });

      await fetch('/api/emails/classifications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classifications: classified.map(e => ({
            thread_id: e.threadId,
            bucket_id: e.bucketId,
            source: e.source,
          })),
        }),
      });

      const hCount = results.filter(r => r.source === 'heuristic').length;
      const lCount = results.filter(r => r.source === 'llm').length;
      const runRes = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_count: rawEmails.length,
          heuristic_count: hCount,
          llm_count: lCount,
          new_count: newEmailCount,
          llm_skipped: skipLLM ? 1 : 0,
        }),
      }).then(r => r.json());

      dispatch({ type: A.RUN_COMPLETE, lastRun: runRes, newCount: newEmailCount });
    } catch (err) {
      console.error('Run failed:', err);
      dispatch({ type: A.NOTIFY, notification: { type: 'error', message: `Run failed: ${err.message}` } });
      dispatch({ type: A.RUN_ERROR });
    }
  }, [state.isRunning, state.buckets, state.config, state.emails]);

  // ── Reclassification threshold callback ────────────────────────────────────
  // When the user has moved enough emails this session, we suggest a re-run
  // rather than silently reclassifying in the background. This keeps the user
  // in control — the re-run is their choice, not something that happens behind
  // their back (which was causing confusing UI state changes).
  useEffect(() => {
    onReclassifyThreshold(() => {
      dispatch({
        type: A.NOTIFY,
        notification: {
          type: 'info',
          message: 'You\'ve moved several emails — press Run to re-sort your inbox with your corrections applied.',
        },
      });
    });
  }, []); // empty deps — callback registered once, dispatch is stable

  // ── Move email ─────────────────────────────────────────────────────────────
  const handleMove = useCallback((email, bucketId) => {
    // Update React state immediately
    dispatch({ type: A.EMAIL_MOVE, threadId: email.threadId, bucketId, source: 'user' });
    // Start debounce timer for corrections table
    registerMove(email, bucketId, state.buckets);
    // Persist to email_classifications
    fetch(`/api/emails/classifications/${email.threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket_id: bucketId, source: 'user' }),
    });
    // Persist to cached_emails so bucket survives refresh and reruns
    fetch(`/api/cache/${email.threadId}/bucket`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket_id: bucketId, source: 'user' }),
    });
  }, [state.buckets]);

  // ── Star toggle ────────────────────────────────────────────────────────────
  const handleStar = useCallback(async (threadId) => {
    const isStarred = state.starredIds.has(threadId);
    dispatch({ type: A.STAR_TOGGLE, threadId });
    // Write to starred_emails table
    if (isStarred) {
      await fetch(`/api/stars/${threadId}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/stars/${threadId}`, { method: 'POST' });
    }
    // Also update cached_emails.is_starred so it survives full reloads
    fetch(`/api/cache/${threadId}/star`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starred: !isStarred }),
    });
  }, [state.starredIds]);

  // ── Handle new bucket created ──────────────────────────────────────────────
  // Rather than silently reclassifying in the background (which caused
  // confusing state), we notify the user and let them trigger a Run.
  const handleBucketCreated = useCallback(() => {
    if (state.emails.length === 0) return;
    dispatch({
      type: A.NOTIFY,
      notification: {
        type: 'info',
        message: 'New bucket created — press Run to sort your emails into it.',
      },
    });
  }, [state.emails.length]);

  // ── Bucket deactivated — snap emails to their last default bucket ──────────
  // The server already moved the emails in the DB (no LLM call).
  // We receive the moved list from BucketManager and update React state to match.
  // Shows a notification suggesting a re-run for best results.
  const handleBucketDeactivated = useCallback((deactivatedBucketId, movedEmails) => {
    // movedEmails = [{ thread_id, bucket_id }] from the server's deactivate endpoint
    for (const { thread_id, bucket_id } of movedEmails) {
      dispatch({ type: A.EMAIL_MOVE, threadId: thread_id, bucketId: bucket_id, source: 'llm' });
    }
    dispatch({
      type: A.NOTIFY,
      notification: {
        type: 'info',
        message: `Bucket hidden — ${movedEmails.length} email${movedEmails.length !== 1 ? 's' : ''} moved to their last known default bucket. A re-run may improve accuracy.`,
      },
    });
  }, []);

  // ── Bucket reactivated — snap emails back to it ────────────────────────────
  // The server already updated the DB. We receive restored thread IDs and
  // update React state so emails appear in the re-enabled bucket immediately.
  const handleBucketReactivated = useCallback((reactivatedBucketId, restoredThreadIds) => {
    for (const threadId of restoredThreadIds) {
      dispatch({ type: A.EMAIL_MOVE, threadId, bucketId: reactivatedBucketId, source: 'llm' });
    }
    if (restoredThreadIds.length > 0) {
      dispatch({
        type: A.NOTIFY,
        notification: {
          type: 'info',
          message: `Bucket restored — ${restoredThreadIds.length} email${restoredThreadIds.length !== 1 ? 's' : ''} returned to it.`,
        },
      });
    }
  }, []);

  // ── Mark read ──────────────────────────────────────────────────────────────
  const handleSetRead = useCallback(async (threadId, isRead) => {
    dispatch({ type: A.EMAIL_READ_SET, threadId, isRead });
    // Persist to SQLite so reruns and page reloads respect the change
    fetch(`/api/cache/${threadId}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: isRead }),
    }).catch(() => {});
    try { await setThreadRead(threadId, isRead); } catch {}
  }, []);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const handleBulkMove = useCallback(async (bucketId) => {
    const ids = [...state.selectedThreadIds];

    // Update React state immediately (source:'user' = never reclassify these)
    dispatch({ type: A.EMAILS_BULK_MOVE, threadIds: ids, bucketId });

    // Persist each move to the cache so it survives a page reload or next Run
    for (const threadId of ids) {
      fetch(`/api/cache/${threadId}/bucket`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket_id: bucketId, source: 'user' }),
      }).catch(() => {});
    }

    // Also update the classifications table
    await fetch('/api/emails/classifications/bulk-move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_ids: ids, bucket_id: bucketId, source: 'user' }),
    }).catch(() => {});
  }, [state.selectedThreadIds]);

  const handleBulkRead = useCallback(async (isRead) => {
    const ids = [...state.selectedThreadIds];
    dispatch({ type: A.EMAILS_BULK_READ_SET, threadIds: ids, isRead });
    dispatch({ type: A.SELECT_CLEAR });
    try { await batchSetRead(ids, isRead); } catch {}
  }, [state.selectedThreadIds]);

  // ── Compose / Reply ────────────────────────────────────────────────────────
  const handleCompose = useCallback(() => {
    dispatch({
      type: A.COMPOSE_OPEN,
      payload: { mode: 'compose', to: '', subject: '', body: '', isLoadingDraft: false },
    });
  }, []);

  const handleReply = useCallback(async (email) => {
    const bucketName = state.buckets.find(b => b.id === email.bucketId)?.name || 'Low Priority';
    const automated = ['newsletter', 'transactions'].includes(bucketName.toLowerCase());

    dispatch({
      type: A.COMPOSE_OPEN,
      payload: {
        mode: 'reply',
        to: email.senderEmail,
        subject: email.subject,
        body: '',
        threadId: email.threadId,
        inReplyToMessageId: email.inReplyToMessageId,
        isLoadingDraft: !automated,
      },
    });

    if (!automated) {
      try {
        const draft = await generateReplyDraft({ email, bucketName, config: state.config });
        dispatch({ type: A.COMPOSE_SET_DRAFT, body: draft });
      } catch {
        dispatch({ type: A.COMPOSE_SET_DRAFT, body: '' });
      }
    }
  }, [state.buckets, state.config]);

  const handleSend = useCallback(async () => {
    const { composeModal } = state;
    if (!composeModal) return;
    try {
      if (composeModal.mode === 'compose') {
        await sendEmail({ to: composeModal.to, subject: composeModal.subject, body: composeModal.body });
      } else {
        await replyToThread({
          threadId: composeModal.threadId,
          to: composeModal.to,
          subject: composeModal.subject,
          body: composeModal.body,
          inReplyToMessageId: composeModal.inReplyToMessageId,
        });
      }
      dispatch({ type: A.COMPOSE_CLOSE });
      dispatch({ type: A.NOTIFY, notification: { type: 'success', message: 'Email sent.' } });
    } catch (err) {
      dispatch({ type: A.NOTIFY, notification: { type: 'error', message: `Send failed: ${err.message}` } });
    }
  }, [state.composeModal]);

  return (
    <div className={styles.screen}>
      <TopBar
        onRun={handleRun}
        onCompose={handleCompose}
        onSignOut={onSignOut}
      />
      <div className={styles.body}>
        <InboxTabs />
        <div className={styles.emailPane}>
          {state.selectedThreadIds.size > 0 && (
            <BulkActionBar onBulkMove={handleBulkMove} onBulkRead={handleBulkRead} />
          )}
          <EmailList
            onMove={handleMove}
            onStar={handleStar}
            onSetRead={handleSetRead}
            onReply={handleReply}
          />
        </div>
      </div>

      {state.composeModal && (
        <ComposeModal onSend={handleSend} onClose={() => dispatch({ type: A.COMPOSE_CLOSE })} />
      )}
      {state.settingsOpen && <SettingsPanel />}
      {state.bucketManagerOpen && (
        <BucketManager
          onBucketCreated={handleBucketCreated}
          onBucketDeactivated={handleBucketDeactivated}
          onBucketReactivated={handleBucketReactivated}
        />
      )}
    </div>
  );
}
