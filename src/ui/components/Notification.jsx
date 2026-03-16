import { useApp } from '../../store/AppContext.jsx';
import styles from './Notification.module.css';

export default function Notification() {
  const { state } = useApp();
  const { notification } = state;
  if (!notification) return null;

  return (
    <div className={`${styles.toast} ${styles[notification.type]}`}>
      <span className={styles.icon}>
        {notification.type === 'success' && '✓'}
        {notification.type === 'error' && '✕'}
        {notification.type === 'info' && 'ℹ'}
      </span>
      <span className={styles.message}>{notification.message}</span>
    </div>
  );
}
