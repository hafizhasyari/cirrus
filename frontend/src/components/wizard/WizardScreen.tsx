import { ProviderBadge } from '../shared/ProviderBadge';
import { CredentialFieldRow } from '../shared/CredentialField';
import type { CirrusApp } from '../../state/useCirrusApp';

export function WizardHeader({ app }: { app: CirrusApp }) {
  return (
    <>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 5 }} onClick={() => app.go('/connections')}>
          ← Cloud Connections
        </div>
        <div className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>Add Cloud Connection</div>
      </div>
      <div />
    </>
  );
}

export function WizardScreen({ app }: { app: CirrusApp }) {
  const step1 = app.wizardStep === 1;
  const step2 = app.wizardStep === 2;
  const wizardProviderMeta = app.wizardProvider ? app.providers.find((p) => p.id === app.wizardProvider) ?? null : null;
  const fields = wizardProviderMeta?.fieldDefs ?? [];
  const setupGuide = wizardProviderMeta?.setupGuide ?? [];
  const failureMessage = wizardProviderMeta?.failureMessage ?? '';
  const wizardIdle = !app.wizardTesting && !app.wizardResult;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="step-circle" data-filled="true">1</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>Choose provider</div>
        </div>
        <div style={{ flex: 1, height: 2, background: step2 ? 'var(--accent)' : 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="step-circle" data-filled={step2}>2</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: step2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            Details &amp; test
          </div>
        </div>
      </div>

      {step1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, maxWidth: 900 }}>
          {app.providers.map((p) => (
            <div
              key={p.id}
              className="card card--clickable"
              style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}
              onClick={() => app.selectWizardProvider(p.id)}
            >
              <ProviderBadge provider={p} size={38} iconSize={19} />
              <div>
                <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{p.authLabel}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {step2 && wizardProviderMeta && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 900 }}>
          <div className="card" style={{ flex: 1, padding: 24, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <ProviderBadge provider={wizardProviderMeta} size={30} iconSize={15} />
              <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>{wizardProviderMeta.name}</div>
              <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => app.wizardBackToStep1()}>
                Change provider
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Account / project name</div>
              <input
                className="field-input font-plain"
                value={app.wizardAccount}
                onChange={(e) => app.updateWizardAccount(e.target.value)}
                placeholder="e.g. prod-infra-01"
              />
            </div>

            {fields.map((f) => (
              <CredentialFieldRow
                key={f.key}
                field={f}
                value={f.kind === 'generated' ? (f.value ?? '') : app.wizardForm[f.key] || ''}
                onChange={(v) => app.updateWizardField(f.key, v)}
              />
            ))}

            {wizardIdle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div className="primary-btn" onClick={() => app.runTest()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M13 2L4.5 14h6L11 22l8.5-12h-6z" />
                  </svg>
                  Test Connection
                </div>
              </div>
            )}

            {app.wizardTesting && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 11-2.6-6.4" />
                </svg>
                Testing connection…
              </div>
            )}

            {app.wizardResult === 'success' && (
              <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Connection validated
                </div>
                <div
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#10b981', color: '#ffffff', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => app.saveConnection()}
                >
                  Save Connection
                </div>
              </div>
            )}

            {app.wizardResult === 'failure' && (
              <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#f43f5e', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  <div>{app.wizardFailureMessage || failureMessage}</div>
                </div>
                <div className="ghost-btn" onClick={() => app.editRetry()}>Edit &amp; Retry</div>
              </div>
            )}
          </div>

          <div className="card" style={{ width: 300, flexShrink: 0, padding: 20, boxSizing: 'border-box' }}>
            <div className="section-label" style={{ marginBottom: 12 }}>How to get these values</div>
            {setupGuide.map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 12 }}>
                <div
                  className="font-display"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
            {wizardProviderMeta?.id === 'gcp' && (
              <a
                href="/api/gcp/jwks"
                download="cirrus-jwks.json"
                className="ghost-btn"
                style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
              >
                Download cirrus-jwks.json
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
