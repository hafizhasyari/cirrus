import type { FieldDef, Provider, ProviderId } from '@cirrus/shared-types';

// Mirrors the frontend's PROVIDERS/FIELD_DEFS/SETUP_GUIDE/FAILURE_MSG,
// per PRD §7.3 — server-side now so a future frontend-wiring pass is a swap, not a redesign.

export const PROVIDERS: Provider[] = [
  { id: 'aws', name: 'AWS', mono: 'AWS', color: '#f0a13c', bg: 'rgba(240,161,60,0.12)', authLabel: 'IAM User Access Key' },
  { id: 'gcp', name: 'Google Cloud', mono: 'GCP', color: '#5b9bf7', bg: 'rgba(91,155,247,0.12)', authLabel: 'Workload Identity Federation' },
  { id: 'alibaba', name: 'Alibaba Cloud', mono: 'AL', color: '#ff8b5a', bg: 'rgba(255,139,90,0.12)', authLabel: 'RAM Role (STS AssumeRole)' },
  { id: 'oci', name: 'Oracle Cloud', mono: 'OCI', color: '#ef6b6b', bg: 'rgba(239,107,107,0.12)', authLabel: 'API Signing Key' },
  { id: 'biznet', name: 'Biznet Gio Cloud', mono: 'BG', color: '#3ecf8e', bg: 'rgba(62,207,142,0.12)', authLabel: 'Static token (x-token)' },
];

export const FIELD_DEFS: Record<ProviderId, FieldDef[]> = {
  aws: [
    { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIAIOSFODNN7EXAMPLE', kind: 'text' },
    { key: 'secretAccessKey', label: 'Secret Access Key', kind: 'textarea', secret: true },
  ],
  gcp: [
    { key: 'projectId', label: 'Project Number', caption: 'The numeric project number (not the project ID string) — required for the Workload Identity Federation audience.', kind: 'text' },
    { key: 'poolId', label: 'Workload Identity Pool ID', kind: 'text' },
    { key: 'providerId', label: 'Provider ID', kind: 'text' },
    { key: 'saEmail', label: 'Service Account email', kind: 'text' },
  ],
  alibaba: [
    { key: 'roleArn', label: 'Role ARN', kind: 'text' },
    { key: 'regionId', label: 'Region ID', kind: 'text' },
  ],
  oci: [
    { key: 'tenancyOcid', label: 'Tenancy OCID', kind: 'text' },
    { key: 'userOcid', label: 'User OCID', kind: 'text' },
    { key: 'fingerprint', label: 'Fingerprint', kind: 'text' },
    { key: 'privateKey', label: 'Private Key', kind: 'textarea', secret: true },
    { key: 'region', label: 'Region', kind: 'text' },
    { key: 'passphrase', label: 'Passphrase (optional)', kind: 'text', secret: true },
  ],
  biznet: [
    { key: 'xToken', label: 'x-token', kind: 'textarea', secret: true },
  ],
};

export const SETUP_GUIDE: Record<ProviderId, string[]> = {
  aws: [
    'In IAM → Users → Create user, add a new user for Cirrus (e.g. cirrus-readonly) — skip console access, this only needs programmatic access',
    'Attach the AmazonEC2ReadOnlyAccess policy directly to the user',
    'Open the user → Security credentials tab → Create access key, and choose "Third-party service" as the use case',
    'Copy the Access Key ID and Secret Access Key below now — the secret is only ever shown once',
  ],
  gcp: [
    'In IAM & Admin → Workload Identity Federation, create a pool and an OIDC provider',
    'Create (or choose) a service account and grant the pool roles/iam.workloadIdentityUser on it',
    'Grant the service account a read-only role (e.g. Compute Viewer)',
    'Copy the project number, pool ID, provider ID, and service account email below',
  ],
  alibaba: [
    'In RAM → Roles, create a role with trusted entity type "Alibaba Cloud Account" set to the Cirrus account ID',
    'Attach a read-only policy to the role and copy its Role ARN',
  ],
  oci: [
    'In Identity → Users → your user → API Keys, generate a new API signing key pair',
    'Download the private key — it is only shown once',
    'Copy the tenancy OCID, user OCID, fingerprint, and region from the generated config preview',
  ],
  biznet: [
    'Log in to the Biznet Gio customer portal (portal.biznetgio.com)',
    'Open the Generate API Key menu',
    'Choose the privilege for the key — pick Read Only (Cirrus never needs Read & Write)',
    'Click Generate and copy the resulting token as the x-token value below',
  ],
};

export const FAILURE_MSG: Record<ProviderId, string> = {
  aws: 'Authentication failed — the Access Key ID/Secret Access Key is invalid, or the IAM user lacks read permissions on EC2.',
  gcp: 'Token exchange failed — check the Workload Identity Pool/Provider IDs and that the service account grants roles/iam.workloadIdentityUser to Cirrus.',
  alibaba: 'AssumeRole failed — the RAM role trust policy does not include the Cirrus account ID.',
  oci: 'Signing key validation failed — check the tenancy/user OCID and fingerprint match the uploaded private key.',
  biznet: 'Request rejected (401/403) — the x-token is invalid or has been revoked from the Biznet Gio portal.',
};
