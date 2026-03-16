// ── Heuristic Classifier ────────────────────────────────────────────────────
// Phase 1 of classification — runs BEFORE the LLM and handles only emails
// we can classify with very high confidence from metadata alone (no body needed).
//
// Think of it like a set of if/elif rules in Python that filter the easy cases
// so the LLM only has to deal with ambiguous ones. Fewer emails to the LLM =
// faster runs + lower cost.
//
// Returns null for anything uncertain — those go to the LLM in Phase 2.

// Sender address prefixes that strongly indicate newsletter emails.
// We only use these in COMBINATION with a List-Unsubscribe header (see below)
// because prefix alone catches too many legitimate senders.
const NEWSLETTER_SENDER_PREFIXES = [
  'newsletter@', 'digest@', 'weekly@', 'daily@',
  'announce@', 'announcements@',
];

// Sender address prefixes that indicate automated/transactional emails.
// These are very reliable — real humans don't send from no-reply@ or billing@.
const TRANSACTION_SENDER_PREFIXES = [
  'no-reply@', 'noreply@', 'do-not-reply@', 'donotreply@',
  'notifications@', 'billing@', 'invoices@', 'invoice@',
  'receipts@', 'receipt@', 'orders@', 'shipping@',
  'automated@', 'system@', 'postmaster@', 'mailer-daemon@',
];

// Known domains that only ever send transactional emails.
const TRANSACTION_DOMAINS = [
  'amazon.com', 'amazon.co.uk', 'amazon.ca',
  'ebay.com', 'etsy.com',
  'paypal.com', 'stripe.com', 'square.com',
  'fedex.com', 'ups.com', 'usps.com', 'dhl.com',
  'uber.com', 'lyft.com', 'doordash.com',
  'bankofamerica.com', 'chase.com', 'wellsfargo.com',
  'americanexpress.com', 'discover.com',
];

// Extract the domain from an email address, e.g. "user@gmail.com" -> "gmail.com"
function senderDomain(senderEmail) {
  const match = senderEmail.toLowerCase().match(/@([^>@\s]+)/);
  return match ? match[1] : '';
}

// Extract "local@" from an email address, e.g. "no-reply@x.com" -> "no-reply@"
function senderLocal(senderEmail) {
  const match = senderEmail.toLowerCase().match(/^([^@]+)@/);
  return match ? match[1] + '@' : '';
}

/**
 * Try to classify a single email using only metadata (no LLM needed).
 * Returns a bucket assignment, or null if we can't be confident.
 *
 * @param {object} email   - { senderEmail, snippet, hasListUnsubscribe }
 * @param {object[]} buckets - active buckets [{ id, name }]
 * @returns {{ bucketId, bucketName } | null}
 */
export function classifyHeuristic(email, buckets) {
  // Helper: find a bucket by name (case-insensitive)
  const findBucket = (name) => buckets.find(b => b.name.toLowerCase() === name.toLowerCase());

  const local = senderLocal(email.senderEmail);
  const domain = senderDomain(email.senderEmail);

  // Rule 1: List-Unsubscribe header AND a newsletter sender prefix.
  // Requiring BOTH signals prevents false positives — GitHub, Slack, etc.
  // all send List-Unsubscribe but aren't newsletters.
  if (email.hasListUnsubscribe && NEWSLETTER_SENDER_PREFIXES.some(p => local === p)) {
    const bucket = findBucket('Newsletter');
    if (bucket) return { bucketId: bucket.id, bucketName: bucket.name };
  }

  // Rule 2: Known transactional sender prefixes (no-reply@, billing@, etc.)
  if (TRANSACTION_SENDER_PREFIXES.some(p => local === p)) {
    const bucket = findBucket('Transactions');
    if (bucket) return { bucketId: bucket.id, bucketName: bucket.name };
  }

  // Rule 3: Known transactional domains (Amazon, PayPal, FedEx, etc.)
  if (TRANSACTION_DOMAINS.includes(domain)) {
    const bucket = findBucket('Transactions');
    if (bucket) return { bucketId: bucket.id, bucketName: bucket.name };
  }

  // Can't determine with confidence — send to LLM
  return null;
}

/**
 * Run heuristics over all emails in a batch.
 * Returns two lists:
 *   heuristicResults - emails we classified confidently
 *   unclaimed        - emails the LLM still needs to handle
 */
export function runHeuristics(emails, buckets) {
  const heuristicResults = [];
  const unclaimed = [];

  for (const email of emails) {
    const result = classifyHeuristic(email, buckets);
    if (result) {
      heuristicResults.push({ threadId: email.threadId, ...result, source: 'heuristic' });
    } else {
      unclaimed.push(email);
    }
  }

  return { heuristicResults, unclaimed };
}
