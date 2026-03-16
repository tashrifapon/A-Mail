// ── Feedback Loop ────────────────────────────────────────────────────────────
// Manages the debounce timer per email move, writes confirmed corrections to
// the server, and fires a callback when enough moves have happened this session
// to warrant a re-run suggestion.
//
// Python analogy: think of each move as a background task with a short delay.
// If the user moves the same email again before the delay expires, we cancel
// the first task and start a new one — so only the final destination is saved.

// 1 second debounce — short enough to feel instant, long enough to catch
// accidental double-moves (e.g. drag-and-drop mis-click then correction).
const DEBOUNCE_MS = 1_000;

// How many distinct emails the user must move before we suggest a re-run.
// We track this per session (in memory) rather than using the DB count,
// which avoids the modulo fragility of checking total_corrections % N.
const RECLASSIFY_THRESHOLD = 5;

// In-memory session move counter — resets when the page reloads.
// This counts emails whose corrections have been successfully written to DB.
let sessionMoveCount = 0;

// Map<threadId, timeoutId> — one pending timer per email
const pendingTimers = new Map();

// Map<threadId, { bucketId, email }> — latest destination per email
const pendingMoves = new Map();

// Callback registered by InboxScreen — called when threshold is reached
let onThresholdReached = null;

/** Register the callback to fire when enough moves accumulate */
export function onReclassifyThreshold(cb) {
  onThresholdReached = cb;
}

/**
 * Register a user move. Starts (or resets) the debounce timer for this email.
 * After DEBOUNCE_MS with no further move, writes the correction to the server.
 */
export function registerMove(email, bucketId, buckets) {
  const { threadId } = email;

  // Cancel any existing timer for this email (user changed their mind)
  if (pendingTimers.has(threadId)) {
    clearTimeout(pendingTimers.get(threadId));
  }

  // Record the latest intended destination
  pendingMoves.set(threadId, { bucketId, email });

  const timerId = setTimeout(async () => {
    pendingTimers.delete(threadId);
    const move = pendingMoves.get(threadId);
    pendingMoves.delete(threadId);

    if (!move) return;

    try {
      await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: move.email.threadId,
          sender: move.email.sender,
          subject: move.email.subject,
          snippet: move.email.snippet,
          bucket_id: move.bucketId,
        }),
      });

      // Increment session counter and fire callback when threshold is hit.
      // Using a session counter (not DB total) avoids the problem where
      // existing corrections in the DB skew the modulo check.
      sessionMoveCount += 1;
      if (sessionMoveCount >= RECLASSIFY_THRESHOLD && sessionMoveCount % RECLASSIFY_THRESHOLD === 0) {
        onThresholdReached?.();
      }
    } catch (err) {
      console.error('Failed to write correction:', err);
    }
  }, DEBOUNCE_MS);

  pendingTimers.set(threadId, timerId);
}

/** Flush all pending timers immediately on page unload — best-effort */
export function flushAll() {
  for (const [threadId, timerId] of pendingTimers.entries()) {
    clearTimeout(timerId);
    const move = pendingMoves.get(threadId);
    if (move) {
      fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: move.email.threadId,
          sender: move.email.sender,
          subject: move.email.subject,
          snippet: move.email.snippet,
          bucket_id: move.bucketId,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  }
  pendingTimers.clear();
  pendingMoves.clear();
}

/** Fetch recent corrections for few-shot injection into the LLM prompt */
export async function fetchRecentCorrections(limit = 20) {
  try {
    const res = await fetch('/api/corrections/recent?limit=' + limit);
    return await res.json();
  } catch {
    return [];
  }
}

// Flush on page unload so moves aren't lost if the user closes the tab
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushAll);
}
