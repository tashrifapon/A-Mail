// ── LLM Classifier ──────────────────────────────────────────────────────────
// Supports: Anthropic (Claude), OpenAI-compatible (OpenAI, Groq).
//
// The prompt is structured with XML tags — Claude responds significantly better
// to XML-delimited sections than to plain text headers. This is a documented
// characteristic of Claude models and is used throughout Anthropic's own docs.

// ── Prompt Builder ───────────────────────────────────────────────────────────
// Builds a Claude-optimized classification prompt using XML structure.
// userEmail = the signed-in user's address (e.g. "you@gmail.com"), injected
// so the model can recognize emails sent from the user's own account.

function buildClassificationPrompt(emails, buckets, corrections, userEmail) {
  // Each active bucket becomes a labeled XML element with its description.
  // Using XML here because Claude parses structured tags very reliably.
  const bucketDefs = buckets
    .filter(b => b.is_active)
    .map(b => '  <bucket name="' + b.name + '">' + b.description + '</bucket>')
    .join('\n');

  // Few-shot correction examples — past user moves shown as ground truth.
  // Claude uses these as the highest-confidence signal, above the rules.
  const examplesSection = corrections.length > 0
    ? '\n<confirmed_examples>\n' +
      'These are ground-truth placements confirmed by the user. Treat them as the highest priority signal:\n' +
      corrections.map(c =>
        '  <example subject="' + c.subject + '" from="' + c.sender + '" bucket="' + c.bucket_name + '"/>'
      ).join('\n') +
      '\n</confirmed_examples>\n'
    : '';

  // The emails to classify, each as a JSON object inside XML.
  const emailItems = emails
    .map(e => '  ' + JSON.stringify({
      threadId: e.threadId,
      from: e.sender + ' <' + e.senderEmail + '>',
      subject: e.subject,
      preview: e.snippet.slice(0, 350),
    }))
    .join('\n');

  // Dynamic rule — only included if we have the user's email address.
  const userEmailRule = userEmail
    ? '\n- Emails sent FROM <' + userEmail + '> to others belong in "Waiting On / Sent" — the user sent these and is tracking them.'
    : '';

  return '<task>Classify each email into exactly one bucket based on the definitions below.</task>\n\n' +
    '<buckets>\n' + bucketDefs + '\n</buckets>\n' +
    examplesSection + '\n' +
    '<emails_to_classify>\n' + emailItems + '\n</emails_to_classify>\n\n' +
    '<rules>\n' +
    '- Read every bucket description carefully — the description is the rule for what belongs there\n' +
    '- If a bucket description matches the email\'s content or signals, use that bucket\n' +
    '- "Transactions" signals: dollar amounts, order numbers, receipts, invoices, shipping, billing, no-reply senders\n' +
    '- "Newsletter" signals: sent to a list, marketing language, unsubscribe links, no direct question to the user\n' +
    '- "Action Required" signals: a direct question to the user, a task assigned, a deadline, needs a reply to proceed\n' +
    '- "Waiting On / Sent" signals: user already replied, someone promised to follow up, thread awaiting others' +
    userEmailRule + '\n' +
    '- "Low Priority" is the DEFAULT — use it when no other bucket clearly fits\n' +
    '- Never force everything into one bucket — spread emails across the most fitting buckets\n' +
    '- If uncertain between two buckets, pick the one whose description matches more specific signals\n' +
    '</rules>\n\n' +
    '<output_format>\n' +
    'Return ONLY a valid JSON object mapping each threadId to a bucket name.\n' +
    'No markdown, no explanation, no extra text. Just the JSON.\n' +
    'Example: {"threadId1": "Action Required", "threadId2": "Transactions"}\n' +
    '</output_format>';
}

// ── Proxy Helper ──────────────────────────────────────────────────────────────
// Forwards all LLM requests through Express to avoid browser CORS restrictions.

async function llmProxy(config, payload) {
  const res = await fetch('/api/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, payload }),
  });
  if (!res.ok) throw new Error('LLM proxy error ' + res.status + ': ' + await res.text());
  return res.json();
}

// ── Anthropic Adapter ─────────────────────────────────────────────────────
// Claude models excel at XML-structured prompts — this is the recommended
// format per Anthropic's prompt engineering documentation.

async function classifyWithAnthropic(emails, buckets, corrections, config, userEmail) {
  const data = await llmProxy(config, {
    model: config.llm_model || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0,  // 0 = fully deterministic for classification tasks
    messages: [{
      role: 'user',
      content: buildClassificationPrompt(emails, buckets, corrections, userEmail),
    }],
  });
  return parseClassificationResponse(data.content?.[0]?.text || '{}', emails, buckets);
}

// ── OpenAI-compatible Adapter ─────────────────────────────────────────────

async function classifyWithOpenAI(emails, buckets, corrections, config, userEmail) {
  const data = await llmProxy(config, {
    model: config.llm_model || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are an expert email classifier. Always respond with valid JSON only. No markdown, no explanation.',
      },
      {
        role: 'user',
        content: buildClassificationPrompt(emails, buckets, corrections, userEmail),
      },
    ],
  });
  return parseClassificationResponse(data.choices?.[0]?.message?.content || '{}', emails, buckets);
}

// ── Response Parser ───────────────────────────────────────────────────────────
// Validates every bucket name the model returns against what actually exists.
// Invalid or hallucinated names fall back to "Low Priority" — the safe default.

function parseClassificationResponse(rawText, emails, buckets) {
  let parsed = {};
  try {
    // Strip any markdown fences the model may have added despite instructions
    const cleaned = (rawText || '{}').replace(/```json|```/gi, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('LLM returned invalid JSON — falling back to Low Priority for this batch');
  }

  // Build a lookup set of valid active bucket names (lowercase for comparison)
  const activeBucketNames = new Set(
    buckets.filter(b => b.is_active).map(b => b.name.toLowerCase())
  );

  // Find bucket by name, fall back to Low Priority, then any active bucket
  const findBucket = (name) =>
    buckets.find(b => b.name.toLowerCase() === (name || '').toLowerCase()) ||
    buckets.find(b => b.name.toLowerCase() === 'low priority') ||
    buckets.find(b => b.is_active);

  return emails.map(email => {
    const assignedName = parsed[email.threadId];
    // Only accept valid bucket names — reject hallucinated ones
    const validName = assignedName && activeBucketNames.has(assignedName.toLowerCase())
      ? assignedName
      : null;
    const bucket = findBucket(validName);
    return {
      threadId: email.threadId,
      bucketId: bucket?.id,
      bucketName: bucket?.name || 'Low Priority',
      source: 'llm',
    };
  });
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function classifyWithLLM(emails, buckets, corrections, config, userEmail) {
  const provider = config.llm_provider || 'anthropic';
  switch (provider) {
    case 'anthropic': return classifyWithAnthropic(emails, buckets, corrections, config, userEmail);
    case 'openai':
    case 'groq':      return classifyWithOpenAI(emails, buckets, corrections, config, userEmail);
    default:          throw new Error('Unknown LLM provider: ' + provider);
  }
}

// ── Reply Draft Generation ────────────────────────────────────────────────────

const TONE_BY_BUCKET = {
  'action required': 'Professional and direct. Confirm what action you will take, or ask one clarifying question to unblock progress.',
  'waiting on / sent': 'Polite follow-up tone. Mention you are following up and ask for a status update.',
  'low priority': 'Brief and friendly. Acknowledge the message casually.',
};

export async function generateReplyDraft({ email, bucketName, config }) {
  const tone = TONE_BY_BUCKET[bucketName?.toLowerCase()] ||
    'Professional and helpful. Keep the reply concise and relevant.';

  const prompt = 'Write a reply to this email.\n\n' +
    '<original_email>\n' +
    'From: ' + email.sender + ' <' + email.senderEmail + '>\n' +
    'Subject: ' + email.subject + '\n' +
    'Preview: ' + email.snippet + '\n' +
    '</original_email>\n\n' +
    '<tone>' + tone + '</tone>\n\n' +
    'Write ONLY the reply body. 2-4 sentences. No subject line, no greeting header, no commentary.';

  const provider = config.llm_provider || 'anthropic';
  try {
    if (provider === 'anthropic') {
      const data = await llmProxy(config, {
        model: config.llm_model || 'claude-haiku-4-5-20251001',
        max_tokens: 512, temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      });
      return data.content?.[0]?.text?.trim() || '';
    }
    if (provider === 'openai' || provider === 'groq') {
      const data = await llmProxy(config, {
        model: config.llm_model || 'gpt-4o-mini', temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      });
      return data.choices?.[0]?.message?.content?.trim() || '';
    }
  } catch (err) {
    console.error('Reply draft failed:', err);
  }
  return '';
}

// ── Bucket Description Verification ──────────────────────────────────────────
// When a user creates a new bucket, we confirm the LLM understands the
// description before saving it — surfaces ambiguity early.

export async function verifyBucketDescription({ name, description, config }) {
  const prompt = '<task>A user is creating an email category. Verify you understand it.</task>\n\n' +
    '<category name="' + name + '">' + description + '</category>\n\n' +
    'In 1-2 sentences, restate what you understand this category to mean.\n' +
    'Then list exactly 3 example email types that would qualify.\n' +
    'Respond ONLY with valid JSON: { "restatement": "...", "examples": ["...", "...", "..."] }';

  try {
    const provider = config.llm_provider || 'anthropic';
    if (provider === 'anthropic') {
      const data = await llmProxy(config, {
        model: config.llm_model || 'claude-haiku-4-5-20251001',
        max_tokens: 512, temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      });
      return JSON.parse((data.content?.[0]?.text || '{}').replace(/```json|```/gi, '').trim());
    }
    const data = await llmProxy(config, {
      model: config.llm_model || 'gpt-4o-mini', temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return JSON.parse((data.choices?.[0]?.message?.content || '{}').replace(/```json|```/gi, '').trim());
  } catch (err) {
    console.error('Bucket verification failed:', err);
    return { restatement: description, examples: [] };
  }
}
