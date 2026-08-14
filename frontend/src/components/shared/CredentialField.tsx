import type { FieldDef } from '../../types';

export function CredentialFieldRow({
  field,
  value,
  onChange,
  error,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{field.label}</div>
      {field.kind === 'text' && (
        <input
          className={`field-input${error ? ' has-error' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {field.kind === 'textarea' && (
        <textarea
          className={`field-textarea${error ? ' has-error' : ''}`}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {field.kind === 'generated' && (
        <>
          <div className="generated-field">{field.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{field.caption}</div>
        </>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
