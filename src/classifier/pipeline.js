import { runHeuristics } from './heuristics.js';
import { classifyWithLLM } from './llmClassifier.js';

// How many emails to send to the LLM in one request.
// 40 is a good balance — big enough to reduce round-trips, small enough
// that the model doesn't lose track of early emails in a long list.
const BATCH_SIZE = 40;

// How many batches to run in parallel. More = faster, but hammers the LLM.
const MAX_CONCURRENT_BATCHES = 3;

/**
 * Full two-phase classification pipeline.
 *
 * Phase 1 — Heuristics: fast rule-based classification for obvious cases
 *            (no-reply senders, known transactional domains, etc.)
 * Phase 2 — LLM: everything the heuristics couldn't confidently claim
 *
 * userEmail is the signed-in user's Google address, injected into the prompt
 * so the model can identify self-sent emails for "Waiting On / Sent".
 */
export async function runClassificationPipeline(emails, buckets, corrections, config, onProgress, userEmail) {
  const activeBuckets = buckets.filter(b => b.is_active);

  // Phase 1: heuristics claim the easy ones
  onProgress?.({ phase: 'heuristic', done: 0, total: emails.length });
  const { heuristicResults, unclaimed } = runHeuristics(emails, activeBuckets);
  onProgress?.({ phase: 'heuristic', done: emails.length - unclaimed.length, total: emails.length });

  if (unclaimed.length === 0) return heuristicResults;

  // Phase 2: LLM handles the rest in parallel batches
  onProgress?.({ phase: 'llm', done: 0, total: unclaimed.length });

  const batches = [];
  for (let i = 0; i < unclaimed.length; i += BATCH_SIZE) {
    batches.push(unclaimed.slice(i, i + BATCH_SIZE));
  }

  const llmResults = [];
  let doneCount = 0;

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const results = await Promise.all(
      concurrentBatches.map(batch =>
        classifyWithLLM(batch, activeBuckets, corrections, config, userEmail)
          .catch(err => {
            // If a batch fails, fall back to Action Required (not Low Priority)
            console.error('LLM batch failed, falling back to Action Required:', err);
            const fallback =
              activeBuckets.find(b => b.name.toLowerCase() === 'action required') ||
              activeBuckets.find(b => b.name.toLowerCase() === 'low priority');
            return batch.map(e => ({
              threadId: e.threadId,
              bucketId: fallback?.id,
              bucketName: fallback?.name || 'Action Required',
              source: 'llm',
            }));
          })
      )
    );

    for (const batchResult of results) {
      llmResults.push(...batchResult);
      doneCount += batchResult.length;
      onProgress?.({ phase: 'llm', done: doneCount, total: unclaimed.length });
    }
  }

  return [...heuristicResults, ...llmResults];
}

/**
 * Reclassify emails when a new bucket is created.
 * Skips user-moved emails and high-confidence heuristic ones.
 * Re-runs everything else so the new bucket gets a fair shot.
 */
export async function reclassifyForNewBucket(allEmails, buckets, corrections, config, newBucketId, onProgress, userEmail) {
  const activeBuckets = buckets.filter(b => b.is_active);
  const HIGH_CONFIDENCE = new Set(['newsletter', 'transactions']);

  const candidates = allEmails.filter(email => {
    if (email.source === 'user') return false; // never touch user-moved

    const bucketName = (buckets.find(b => b.id === email.bucketId)?.name || '').toLowerCase();

    // Skip heuristic-classified newsletter/transaction emails — high confidence
    if (email.source === 'heuristic' && HIGH_CONFIDENCE.has(bucketName)) return false;

    // Always re-run emails currently in the new bucket or in flexible buckets
    if (email.bucketId === newBucketId) return true;
    if (email.source === 'llm') return true;

    return false;
  });

  if (candidates.length === 0) return [];
  return runClassificationPipeline(candidates, activeBuckets, corrections, config, onProgress, userEmail);
}

/**
 * Reclassify after the user has moved enough emails to teach the model.
 * Only touches non-user-moved emails. Capped at 200 for performance.
 * This is what fires after the RECLASSIFY_THRESHOLD is hit.
 */
export async function reclassifyAfterCorrections(allEmails, buckets, corrections, config, onProgress, userEmail) {
  const activeBuckets = buckets.filter(b => b.is_active);

  // Only reclassify emails the AI placed — never override user decisions
  const candidates = allEmails
    .filter(email => email.source !== 'user')
    .slice(0, 200);

  if (candidates.length === 0) return [];
  return runClassificationPipeline(candidates, activeBuckets, corrections, config, onProgress, userEmail);
}
