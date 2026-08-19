import { useEffect, useRef, useState } from 'react';

type ToastData = { message: string; variant?: 'success' | 'error' } | null;

export function Toast({ toast }: { toast: ToastData }) {
  const [phase, setPhase] = useState<'entering' | 'exiting' | null>(null);
  const [content, setContent] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (toast) {
      setContent({ message: toast.message, variant: toast.variant ?? 'success' });
      setPhase('entering');
      return;
    }
    if (phaseRef.current === null) return;
    setPhase('exiting');
    const timer = setTimeout(() => setPhase(null), 200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (phase === null || !content) return null;

  const isError = content.variant === 'error';

  return (
    <div className={`toast toast-${phase}`} style={isError ? { borderColor: '#ef4444' } : undefined}>
      {isError ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 8v5" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.5" fill="#ef4444" stroke="none" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      )}
      {content.message}
    </div>
  );
}
