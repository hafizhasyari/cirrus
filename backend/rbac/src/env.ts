function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: required('DATABASE_URL'),
  internalSharedSecret: required('INTERNAL_SHARED_SECRET'),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL,
  vaultAddr: required('VAULT_ADDR'),
  vaultToken: required('VAULT_TOKEN'),
};
