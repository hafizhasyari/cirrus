import type { FieldDef, Provider, ProviderId } from '@cirrus/shared-types';

// Mirrors frontend/src/data/mockData.ts's PROVIDERS/FIELD_DEFS/CHECKLIST/FAILURE_MSG,
// per PRD §7.3 — server-side now so a future frontend-wiring pass is a swap, not a redesign.

export const PROVIDERS: Provider[] = [
  { id: 'aws', name: 'AWS', mono: 'AWS', color: '#f0a13c', bg: 'rgba(240,161,60,0.12)', authLabel: 'Cross-account IAM Role' },
  { id: 'gcp', name: 'Google Cloud', mono: 'GCP', color: '#5b9bf7', bg: 'rgba(91,155,247,0.12)', authLabel: 'Workload Identity Federation' },
  { id: 'alibaba', name: 'Alibaba Cloud', mono: 'AL', color: '#ff8b5a', bg: 'rgba(255,139,90,0.12)', authLabel: 'RAM Role (STS AssumeRole)' },
  { id: 'oci', name: 'Oracle Cloud', mono: 'OCI', color: '#ef6b6b', bg: 'rgba(239,107,107,0.12)', authLabel: 'API Signing Key' },
  { id: 'biznet', name: 'Biznet Gio Cloud', mono: 'BG', color: '#3ecf8e', bg: 'rgba(62,207,142,0.12)', authLabel: 'Static token (x-token)' },
];

export const FIELD_DEFS: Record<ProviderId, FieldDef[]> = {
  aws: [
    { key: 'roleArn', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789012:role/CirrusReadOnly', kind: 'text' },
    { key: 'externalId', label: 'External ID', kind: 'generated', caption: 'Paste this into the trust policy of the role above.' },
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
    { key: 'privateKey', label: 'Private Key', kind: 'textarea' },
    { key: 'region', label: 'Region', kind: 'text' },
    { key: 'passphrase', label: 'Passphrase (optional)', kind: 'text' },
  ],
  biznet: [
    { key: 'xToken', label: 'x-token', kind: 'textarea' },
  ],
};

export const CHECKLIST: Record<ProviderId, string[]> = {
  aws: ['sts:AssumeRole — assume the registered role', 'sts:GetCallerIdentity — confirm assume succeeded', 'ec2:DescribeRegions — confirm EC2 read scope'],
  gcp: ['iamcredentials.generateAccessToken — exchange WIF token', 'resourcemanager.testIamPermissions — confirm compute.viewer scope'],
  alibaba: ['sts:AssumeRole — assume the registered RAM role', 'sts:GetCallerIdentity — confirm identity valid'],
  oci: ['config.validate_config — validate signing config', 'identity.list_regions — confirm signing validity', 'compute.list_instances (limit 1) — confirm read-only policy attached'],
  biznet: ['GET /neolites/accounts — cheapest authenticated call'],
};

export const FAILURE_MSG: Record<ProviderId, string> = {
  aws: 'AssumeRole failed — the trust policy on the target role does not include the Cirrus account ID.',
  gcp: 'Token exchange failed — check the Workload Identity Pool/Provider IDs and that the service account grants roles/iam.workloadIdentityUser to Cirrus.',
  alibaba: 'AssumeRole failed — the RAM role trust policy does not include the Cirrus account ID.',
  oci: 'Signing key validation failed — check the tenancy/user OCID and fingerprint match the uploaded private key.',
  biznet: 'Request rejected (401/403) — the x-token is invalid or has been revoked from the Biznet Gio portal.',
};
