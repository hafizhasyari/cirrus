export function CheckboxBox({ checked, color }: { checked: boolean; color: string }) {
  return (
    <div
      className="checkbox-box"
      data-checked={checked}
      style={checked ? { borderColor: color, background: color } : undefined}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </div>
  );
}
