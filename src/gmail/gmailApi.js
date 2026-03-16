import { getAccessToken } from '../auth/googleAuth.js';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gRequest(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gmail API error ${res.status}`);
  }
  return res.json();
}

/** Extract a specific header value from a message */
function getHeader(headers, name) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

/** Parse a Gmail message into our email shape */
function parseThread(thread, messages) {
  // Use the most recent message for display
  const msg = messages[messages.length - 1];
  const headers = msg.payload?.headers || [];
  const firstMsg = messages[0];
  const firstHeaders = firstMsg.payload?.headers || [];

  const from = getHeader(headers, 'from');
  // Parse "Name <email>" format
  const nameMatch = from.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/);
  const senderName = nameMatch?.[1]?.trim() || from;
  const senderEmail = nameMatch?.[2]?.trim() || from;

  return {
    threadId: thread.id,
    subject: getHeader(firstHeaders, 'subject') || '(no subject)',
    sender: senderName,
    senderEmail: senderEmail,
    snippet: thread.snippet || '',
    date: new Date(parseInt(msg.internalDate)).toISOString(),
    isRead: !msg.labelIds?.includes('UNREAD'),
    messageId: msg.id,
    inReplyToMessageId: getHeader(headers, 'message-id'),
    // Raw headers for heuristic classifier
    hasListUnsubscribe: !!getHeader(firstHeaders, 'list-unsubscribe'),
    listUnsubscribeHeader: getHeader(firstHeaders, 'list-unsubscribe'),
  };
}

/** Fetch the last N threads from the inbox */
export async function fetchInboxThreads(maxResults = 200, onProgress) {
  // Step 1: list thread IDs
  const listData = await gRequest(`/threads?maxResults=${maxResults}&labelIds=INBOX`);
  const threads = listData.threads || [];

  if (onProgress) onProgress({ phase: 'fetching', done: 0, total: threads.length });

  // Step 2: fetch each thread in parallel batches of 20
  const BATCH = 20;
  const results = [];

  for (let i = 0; i < threads.length; i += BATCH) {
    const batch = threads.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(t =>
        gRequest(`/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=List-Unsubscribe`)
      )
    );
    for (const threadData of batchResults) {
      const messages = threadData.messages || [];
      if (messages.length > 0) {
        results.push(parseThread(threadData, messages));
      }
    }
    if (onProgress) onProgress({ phase: 'fetching', done: Math.min(i + BATCH, threads.length), total: threads.length });
  }

  return results;
}

/** Mark a thread as read or unread */
export async function setThreadRead(threadId, isRead) {
  const body = isRead
    ? { removeLabelIds: ['UNREAD'] }
    : { addLabelIds: ['UNREAD'] };
  return gRequest(`/threads/${threadId}/modify`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Mark multiple threads as read or unread */
export async function batchSetRead(threadIds, isRead) {
  return Promise.all(threadIds.map(id => setThreadRead(id, isRead)));
}

/** Encode a MIME message to base64url */
function encodeMime(headers, body) {
  const mime = [...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), '', body].join('\r\n');
  return btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Send a new email */
export async function sendEmail({ to, subject, body }) {
  const raw = encodeMime(
    {
      To: to,
      Subject: subject,
      'Content-Type': 'text/plain; charset=utf-8',
      'MIME-Version': '1.0',
    },
    body
  );
  return gRequest('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}

/** Reply to an existing thread */
export async function replyToThread({ threadId, to, subject, body, inReplyToMessageId }) {
  const headers = {
    To: to,
    Subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    'Content-Type': 'text/plain; charset=utf-8',
    'MIME-Version': '1.0',
    'In-Reply-To': inReplyToMessageId,
    References: inReplyToMessageId,
  };
  const raw = encodeMime(headers, body);
  return gRequest('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, threadId }),
  });
}
