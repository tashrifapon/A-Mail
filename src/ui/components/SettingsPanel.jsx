import { useState, useEffect } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import styles from './SettingsPanel.module.css';

const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5-20251001',
    needsKey: true,
    hint: 'Excellent classification quality. Claude Haiku is cheapest.',
    docs: 'https://console.anthropic.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    hint: 'Use gpt-4o-mini for cost-effective classification.',
    docs: 'https://platform.openai.com',
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultUrl: 'https://api.groq.com/openai',
    defaultModel: 'llama-3.1-8b-instant',
    needsKey: true,
    hint: 'Fastest inference available. Free tier with rate limits.',
    docs: 'https://console.groq.com',
  },
];

export default function SettingsPanel() {
  const { state, dispatch } = useApp();
  const [form, setForm] = useState({ ...state.config });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { setForm({ ...state.config }); }, [state.config]);

  const provider = PROVIDERS.find(p => p.id === form.llm_provider) || PROVIDERS[0];

  function handleProviderChange(id) {
    const p = PROVIDERS.find(pr => pr.id === id);
    setForm(f => ({
      ...f,
      llm_provider: id,
      llm_base_url: p.defaultUrl,
      llm_model: p.defaultModel,
      llm_api_key: '',
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      dispatch({ type: A.SET_CONFIG, config: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      dispatch({ type: A.NOTIFY, notification: { type: 'error', message: `Failed to save: ${err.message}` } });
    } finally {
      setSaving(false);
    }
  }

  async function handlePrune() {
    try {
      await fetch('/api/corrections/prune?days=90', { method: 'DELETE' });
      await fetch('/api/emails/classifications/history/prune?days=90', { method: 'DELETE' });
      dispatch({ type: A.NOTIFY, notification: { type: 'success', message: 'History cleared (>90 days).' } });
    } catch {
      dispatch({ type: A.NOTIFY, notification: { type: 'error', message: 'Clearing history failed.' } });
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && dispatch({ type: A.SETTINGS_TOGGLE })}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={() => dispatch({ type: A.SETTINGS_TOGGLE })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* LLM Provider */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>LLM Provider</h3>

            <div className={styles.providerGrid}>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  className={`${styles.providerCard} ${form.llm_provider === p.id ? styles.providerActive : ''}`}
                  onClick={() => handleProviderChange(p.id)}
                >
                  <span className={styles.providerLabel}>{p.label}</span>
                  {!p.needsKey && <span className={styles.freeBadge}>Free</span>}
                </button>
              ))}
            </div>

            {provider.hint && (
              <p className={styles.providerHint}>
                {provider.hint}{' '}
                <a href={provider.docs} target="_blank" rel="noopener noreferrer">Docs →</a>
              </p>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Base URL</label>
              <input
                className={styles.input}
                type="text"
                value={form.llm_base_url || ''}
                onChange={e => setForm(f => ({ ...f, llm_base_url: e.target.value }))}
                placeholder={provider.defaultUrl}
                spellCheck={false}
              />
              <p className={styles.hint}>
                Change this if you're running a custom endpoint or a proxy.
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Model</label>
              <input
                className={styles.input}
                type="text"
                value={form.llm_model || ''}
                onChange={e => setForm(f => ({ ...f, llm_model: e.target.value }))}
                placeholder={provider.defaultModel}
                spellCheck={false}
              />
              <p className={styles.hint}>
                Exact model string as shown in the provider's docs.
              </p>
            </div>

            {provider.needsKey && (
              <div className={styles.field}>
                <label className={styles.label}>API Key</label>
                <div className={styles.keyRow}>
                  <input
                    className={styles.input}
                    type={showKey ? 'text' : 'password'}
                    value={form.llm_api_key || ''}
                    onChange={e => setForm(f => ({ ...f, llm_api_key: e.target.value }))}
                    placeholder="sk-..."
                    spellCheck={false}
                  />
                  <button className={styles.showKeyBtn} onClick={() => setShowKey(p => !p)}>
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className={styles.hint}>
                  Stored in your local SQLite database. Never sent anywhere except the provider's API.
                </p>
              </div>
            )}
          </section>

          <div className={styles.divider} />

          {/* Run threshold */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Run Behaviour</h3>
            <div className={styles.field}>
              <label className={styles.label}>LLM Skip Threshold</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                max="500"
                value={form.llm_threshold ?? '30'}
                onChange={e => setForm(f => ({ ...f, llm_threshold: e.target.value }))}
              />
              <p className={styles.hint}>
                If fewer than this many <em>new</em> emails are found on a Run, skip the LLM
                and keep existing classifications. Set to <strong>0</strong> to always run the LLM.
                Default is 30.
              </p>
            </div>
          </section>

          <div className={styles.divider} />

          {/* Data management */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Data</h3>
            <div className={styles.field}>
              <p className={styles.hint}>
                Clear correction and classification histories older than 90 days.
                This does not affect your emails or buckets.
              </p>
              <button className={styles.pruneBtn} onClick={handlePrune}>
                Clear History
              </button>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={() => dispatch({ type: A.SETTINGS_TOGGLE })}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
