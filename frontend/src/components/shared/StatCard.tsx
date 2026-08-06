export function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card stat-card">
      <div className="section-label">{label}</div>
      <div className="stat-num" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
