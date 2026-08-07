import { useEffect, useState } from 'react';

type ToastData = { message: string } | null;

export function Toast({ toast }: { toast: ToastData }) {
  const [phase, setPhase] = useState<'entering' | 'exiting' | null>(null);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      setContent(toast.message);
      setPhase('entering');
      return;
    }
    if (phase === null) return;
    setPhase('exiting');
    const timer = setTimeout(() => setPhase(null), 200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (phase === null) return null;

  return (
    <div className={`toast toast-${phase}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" opacity="0.25" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      {content}
    </div>
  );
}
