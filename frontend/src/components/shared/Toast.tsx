export function Toast({ message }: { message: string }) {
  return (
    <div className="toast">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" opacity="0.25" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      {message}
    </div>
  );
}
