export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '6px 20px' }}>
      <phantom-ui loading count={count} count-gap={8} fallback-radius={8} duration={1.4}>
        <div className="skeleton-row-shape" />
      </phantom-ui>
    </div>
  );
}
