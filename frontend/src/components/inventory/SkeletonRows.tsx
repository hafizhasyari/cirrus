import { useLayoutEffect, useRef, useState } from 'react';

const COLUMN_LABELS = ['Name', 'Provider', 'Account', 'Region', 'Status', 'Type', 'CPU', 'Memory', 'Disk', 'IP'];
// phantom-ui hides its slotted content while `loading` (to show the shimmer overlay
// instead), so a row inside it always measures 0 via offsetHeight/getBoundingClientRect —
// can't be measured at runtime. This is the rendered height of one .skeleton-grid-row
// body row (padding + its tallest, 2-line cell) observed in practice.
const BODY_ROW_HEIGHT = 46;

function Chip({ w, h = 12, round, ml, mt }: { w: number; h?: number; round?: boolean; ml?: number; mt?: number }) {
  return (
    <span
      className="skeleton-chip"
      style={{ width: w, height: h, marginLeft: ml, marginTop: mt, borderRadius: round ? '50%' : undefined }}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="skeleton-grid-row">
      <div className="td">
        <Chip w={110} h={13} />
        <div>
          <Chip w={70} h={10} mt={6} />
        </div>
      </div>
      <div className="td" style={{ whiteSpace: 'nowrap' }}>
        <Chip w={26} h={26} round />
        <Chip w={60} ml={8} />
      </div>
      <div className="td">
        <Chip w={90} />
      </div>
      <div className="td">
        <Chip w={60} />
      </div>
      <div className="td">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Chip w={8} h={8} round />
          <Chip w={55} />
        </div>
      </div>
      <div className="td">
        <Chip w={70} />
      </div>
      <div className="td">
        <Chip w={50} />
      </div>
      <div className="td">
        <Chip w={50} />
      </div>
      <div className="td">
        <Chip w={50} />
      </div>
      <div className="td">
        <Chip w={85} />
        <div>
          <Chip w={85} mt={6} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRows() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(8);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const available = container.clientHeight - headerHeight;
      setCount(Math.max(1, Math.ceil(available / BODY_ROW_HEIGHT) + 1));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div ref={headerRef} className="skeleton-grid-row">
        {COLUMN_LABELS.map((label) => (
          <div key={label} className="th">{label}</div>
        ))}
      </div>
      <phantom-ui loading fallback-radius={6} duration={1.4}>
        {Array.from({ length: count }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </phantom-ui>
    </div>
  );
}
