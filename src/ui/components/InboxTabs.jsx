import { useApp, useBucketCounts } from '../../store/AppContext.jsx';
import { A } from '../../store/appReducer.js';
import styles from './InboxTabs.module.css';

const BUCKET_COLORS = {
  'action required': { color: 'var(--bucket-action)', bg: 'var(--bucket-action-dim)' },
  'waiting on':      { color: 'var(--bucket-waiting)', bg: 'var(--bucket-waiting-dim)' },
  'newsletter':      { color: 'var(--bucket-newsletter)', bg: 'var(--bucket-newsletter-dim)' },
  'transactions':    { color: 'var(--bucket-transactions)', bg: 'var(--bucket-transactions-dim)' },
  'low priority':    { color: 'var(--bucket-low)', bg: 'var(--bucket-low-dim)' },
  'starred':         { color: 'var(--bucket-starred)', bg: 'var(--bucket-starred-dim)' },
};

function getBucketStyle(name) {
  return BUCKET_COLORS[name?.toLowerCase()] || { color: 'var(--bucket-custom)', bg: 'var(--bucket-custom-dim)' };
}

function BucketDot({ name }) {
  const { color } = getBucketStyle(name);
  return <span className={styles.dot} style={{ background: color }} />;
}

function TabItem({ id, name, count, isActive, onClick }) {
  const { color, bg } = getBucketStyle(name);
  return (
    <button
      className={`${styles.tab} ${isActive ? styles.active : ''}`}
      onClick={() => onClick(id)}
      style={isActive ? { '--tab-accent': color, '--tab-bg': bg } : {}}
    >
      <BucketDot name={name} />
      <span className={styles.tabName}>{name}</span>
      {count > 0 && (
        <span className={styles.badge} style={isActive ? { background: bg, color } : {}}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export default function InboxTabs() {
  const { state, dispatch } = useApp();
  const counts = useBucketCounts();

  const totalEmails = state.emails.length;
  const unreadEmails = state.emails.filter(e => !e.isRead).length;

  const activeBuckets = state.buckets.filter(b => b.is_active);
  const setTab = (tabId) => dispatch({ type: A.SET_ACTIVE_TAB, tabId });

  return (
    <nav className={styles.sidebar}>
      <div className={styles.totalCount}>
        <span className={styles.totalLabel}>Total</span>
        <span className={styles.totalNumbers}>
          {unreadEmails} unread · {totalEmails}
        </span>
      </div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Starred</span>
        <TabItem
          id="starred"
          name="Starred"
          count={counts['starred'] || 0}
          isActive={state.activeTabId === 'starred'}
          onClick={setTab}
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Buckets</span>
        {activeBuckets.map(bucket => (
          <TabItem
            key={bucket.id}
            id={bucket.id}
            name={bucket.name}
            count={counts[bucket.id] || 0}
            isActive={state.activeTabId === bucket.id}
            onClick={setTab}
          />
        ))}
      </div>
    </nav>
  );
}
