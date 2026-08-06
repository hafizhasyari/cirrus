export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '6px 20px', display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ flex: 1 }} />
      ))}
    </div>
  );
}
