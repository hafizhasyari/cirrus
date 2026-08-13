function Chip({ w, h = 12, round, ml, mt }: { w: number; h?: number; round?: boolean; ml?: number; mt?: number }) {
  return (
    <span
      className="skeleton-chip"
      style={{ width: w, height: h, marginLeft: ml, marginTop: mt, borderRadius: round ? '50%' : undefined }}
    />
  );
}

export function UserRowSkeleton() {
  return (
    <phantom-ui loading fallback-radius={6} duration={1.4}>
      <table className="cirrus-table">
        <thead>
          <tr>
            <th className="th">User</th>
            <th className="th">Role</th>
            <th className="th">Last login</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i}>
              <td className="td">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Chip w={30} h={30} round />
                  <div>
                    <Chip w={120} h={12.5} />
                    <div>
                      <Chip w={150} h={11} mt={6} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="td">
                <Chip w={60} h={20} />
              </td>
              <td className="td">
                <Chip w={90} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </phantom-ui>
  );
}
