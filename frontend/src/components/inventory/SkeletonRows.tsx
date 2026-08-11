const COLUMN_LABELS = ['Name', 'Provider', 'Account', 'Region', 'Status', 'Type', 'CPU', 'Memory', 'Disk', 'IP'];

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

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div className="skeleton-grid-row">
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
