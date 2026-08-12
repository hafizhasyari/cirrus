import { useNavigate } from '@tanstack/react-router';
import { useApp } from '../../state/AppContext';
import { LinkOffIcon } from './EmptyState';
import cirrusMark from '../../assets/cirrus-mark.svg';

export function NotFoundScreen() {
  const app = useApp();
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: 'var(--page-bg)',
        boxSizing: 'border-box',
        padding: '32px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <img src={cirrusMark} alt="" width={28} height={28} style={{ flexShrink: 0 }} />
        <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Cirrus</div>
      </div>

      <div
        className="card"
        style={{
          width: 'min(420px, 100%)',
          padding: '40px 34px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          boxSizing: 'border-box',
        }}
      >
        <LinkOffIcon />
        <div style={{ textAlign: 'center' }}>
          <div className="font-display" style={{ fontSize: 21, fontWeight: 700, color: 'var(--text-primary)' }}>Page not found</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            The page you're looking for doesn't exist or may have moved.
          </div>
        </div>
        <button
          type="button"
          className="primary-btn"
          style={{ width: '100%', justifyContent: 'center', padding: '11px 18px' }}
          onClick={() => navigate({ to: app.currentUser ? '/inventory' : '/' })}
        >
          Back to home
        </button>
      </div>
    </div>
  );
}
