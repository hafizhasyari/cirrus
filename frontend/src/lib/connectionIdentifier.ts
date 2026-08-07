import type { ProviderId, WizardFormValues } from '../types';

/** Derives the non-secret display `identifier` the backend expects when
 * creating/updating a connection, from whichever per-provider credential
 * field actually identifies the account (mirrors the format the backend's
 * own seed data / mockData's old fixtures used). */
export function computeIdentifier(provider: ProviderId, form: WizardFormValues): string {
  switch (provider) {
    case 'aws':
      return form.accessKeyId || '—';
    case 'alibaba':
      return form.roleArn || '—';
    case 'gcp':
      return form.projectId ? `project: ${form.projectId}` : '—';
    case 'oci':
      return form.tenancyOcid || '—';
    case 'biznet': {
      const token = form.xToken || '';
      return token ? `x-token •••• ${token.slice(-4)}` : '—';
    }
    default:
      return '—';
  }
}
