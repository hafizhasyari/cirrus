function Chip({ w, h = 12, round, ml, mt }: { w: number; h?: number; round?: boolean; ml?: number; mt?: number }) {
  return (
    <span
      className="skeleton-chip"
      style={{ width: w, height: h, marginLeft: ml, marginTop: mt, borderRadius: round ? '50%' : undefined }}
    />
  );
}

export function ConnectionCardSkeleton() {
  return (
    <phantom-ui loading fallback-radius={6} duration={1.4}>
      <div className="card" style={{ padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <Chip w={30} h={30} round />
          <Chip w={70} h={20} />
        </div>
        <div>
          <Chip w={130} h={15} />
          <div>
            <Chip w={80} h={11.5} mt={6} />
          </div>
        </div>
        <Chip w={200} h={30} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 11 }}>
          <Chip w={70} />
          <Chip w={90} />
        </div>
      </div>
    </phantom-ui>
  );
}
