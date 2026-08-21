import type { FieldDef, Provider, ProviderId } from '@cirrus/shared-types';

// Mirrors the frontend's PROVIDERS/FIELD_DEFS/SETUP_GUIDE/FAILURE_MSG,
// per PRD §7.3 — server-side now so a future frontend-wiring pass is a swap, not a redesign.

export const PROVIDERS: Provider[] = [
  { id: 'aws', name: 'AWS', mono: 'AWS', color: '#f0a13c', bg: 'rgba(240,161,60,0.12)', authLabel: 'IAM User Access Key' },
  { id: 'gcp', name: 'Google Cloud', mono: 'GCP', color: '#5b9bf7', bg: 'rgba(91,155,247,0.12)', authLabel: 'Workload Identity Federation' },
  { id: 'alibaba', name: 'Alibaba Cloud', mono: 'AL', color: '#ff6a00', bg: 'rgba(255,106,0,0.12)', authLabel: 'Static Access Key (RAM User)' },
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
    { key: 'accessKeyId', label: 'AccessKey ID', placeholder: 'LTAI5t...', kind: 'text' },
    { key: 'secretAccessKey', label: 'AccessKey Secret', kind: 'textarea', secret: true },
  ],
  oci: [
    { key: 'tenancyOcid', label: 'Tenancy OCID', kind: 'text' },
    { key: 'userOcid', label: 'User OCID', kind: 'text' },
    { key: 'fingerprint', label: 'Fingerprint', kind: 'text' },
    { key: 'privateKey', label: 'Private Key', kind: 'textarea', secret: true },
    { key: 'region', label: 'Region', caption: 'Any valid OCI region works here — Cirrus automatically discovers and fetches instances from every region this tenancy is subscribed to, not just this one.', kind: 'text' },
    { key: 'passphrase', label: 'Passphrase (optional)', kind: 'text', secret: true, optional: true },
  ],
  biznet: [
    { key: 'xToken', label: 'x-token', kind: 'textarea', secret: true },
  ],
};

export function buildSetupGuide(jwtIssuer: string): Record<ProviderId, string[]> {
  return {
    aws: [
      'In IAM → Users → Create user, add a new user for Cirrus (e.g. cirrus-readonly) — skip console access, this only needs programmatic access',
      'Attach the AmazonEC2ReadOnlyAccess policy directly to the user',
      'If this account also runs VMs on AWS Lightsail (not just EC2): AWS has no dedicated Lightsail-read-only managed policy, so in IAM → Policies → Create policy → JSON tab, paste the policy JSON from the card on the right, then name it (e.g. CirrusLightsailReadOnly) and create it',
      'Attach that new policy to the same Cirrus user too (open the user → Permissions tab → Add permissions → Attach policies directly) — without it, Lightsail instances simply won\'t appear in inventory, but EC2 will keep working either way',
      'Open the user → Security credentials tab → Create access key, and choose "Third-party service" as the use case',
      'Copy the Access Key ID and Secret Access Key below now — the secret is only ever shown once',
    ],
    gcp: [
      'In IAM & Admin → Workload Identity Federation, click Create Pool (e.g. name it cirrus-inventory-pool)',
      'Add a provider to the pool and choose OpenID Connect (OIDC) — not AWS, Azure AD, or SAML',
      `Set the Issuer (URL) to ${jwtIssuer} — it does not need to be a publicly reachable address`,
      'Since the issuer isn\'t public, choose "Upload JWKS manually" and paste in the JSON from the "Download cirrus-jwks.json" button below',
      'Leave Audiences on "Default audience" — do not add a custom one',
      'Under Attribute Mapping, set google.subject = assertion.sub (required)',
      'Create or choose a Service Account, open it, go to "Principals with access" (not "Permissions") → Grant Access, and for "New principals" use the identifier shown below, then assign it the Workload Identity User role — this must be granted on the Service Account itself, not on the project',
      'Separately, on the IAM page, grant that same Service Account a read-only role on the project, e.g. Compute Viewer',
      'Copy the Project Number (numeric, from the project Dashboard — not the Project ID string), Pool ID, Provider ID, and Service Account email into the fields below',
    ],
    alibaba: [
      'In RAM → Users → Create User, add a new user for Cirrus (e.g. cirrus-readonly) — skip console access, this only needs programmatic access',
      'Attach the AliyunECSReadOnlyAccess policy directly to the user',
      'Open the user → User Details → AccessKey pairs → Create AccessKey',
      'Copy the AccessKey ID and AccessKey Secret below now — the secret is only ever shown once',
      'No need to pick a region — Cirrus automatically discovers and fetches instances from every region this AccessKey can access',
    ],
    oci: [
      'In Identity → Users → your user → API Keys, generate a new API signing key pair',
      'Download the private key — it is only shown once',
      'Copy the tenancy OCID, user OCID, fingerprint, and region from the generated config preview',
      'The region is still required as a starting point, but any valid region works — Cirrus automatically discovers and fetches instances from every region this tenancy is subscribed to',
    ],
    biznet: [
      'Log in to the Biznet Gio customer portal (portal.biznetgio.com)',
      'Open the Generate API Key menu',
      'Choose the privilege for the key — pick Read Only (Cirrus never needs Read & Write)',
      'Click Generate and copy the resulting token as the x-token value below',
    ],
  };
}

export const FAILURE_MSG: Record<ProviderId, string> = {
  aws: 'Authentication failed — the Access Key ID/Secret Access Key is invalid, or the IAM user lacks read permissions on EC2.',
  gcp: 'Token exchange failed — check the Workload Identity Pool/Provider IDs and that the service account grants roles/iam.workloadIdentityUser to Cirrus.',
  alibaba: 'Authentication failed — the AccessKey ID/AccessKey Secret is invalid, or the RAM user lacks read permissions on ECS.',
  oci: 'Signing key validation failed — check the tenancy/user OCID and fingerprint match the uploaded private key.',
  biznet: 'Request rejected (401/403) — the x-token is invalid or has been revoked from the Biznet Gio portal.',
};
