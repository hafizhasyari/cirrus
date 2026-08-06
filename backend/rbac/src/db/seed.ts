import { and, eq, sql } from 'drizzle-orm';
import { env } from '../env.js';
import { db, pool } from './client.js';
import { cloudConnections, users } from './schema.js';

const SAMPLE_CONNECTIONS: { provider: (typeof cloudConnections.$inferInsert)['provider']; account: string; identifier: string }[] = [
  { provider: 'aws', account: 'prod-infra-01', identifier: 'arn:aws:iam::123456789012:role/CirrusReadOnly' },
  { provider: 'gcp', account: 'inmotion-prod', identifier: 'project: inmotion-prod' },
  { provider: 'alibaba', account: 'alibaba-cn-main', identifier: 'acs:ram::1234567890:role/CirrusReadOnly' },
  { provider: 'oci', account: 'tenancy-primary', identifier: 'ocid1.tenancy.oc1..aaaaaaaa' },
  { provider: 'biznet', account: 'biznetgio-corp', identifier: 'x-token •••• 8f2a' },
];

async function main() {
  const adminEmail = env.seedAdminEmail ?? 'admin@example.com';

  // Matches the case-insensitive unique index on lower(email) — a plain
  // ON CONFLICT (email) can't target that expression index, so check first.
  const [existingAdmin] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${adminEmail})`);

  const adminId =
    existingAdmin?.id ??
    (
      await db
        .insert(users)
        .values({ email: adminEmail, name: 'Bootstrap Admin', role: 'admin', status: 'pending' })
        .returning()
    )[0]?.id;

  if (!adminId) throw new Error('seed: could not resolve bootstrap admin id');

  for (const conn of SAMPLE_CONNECTIONS) {
    const existing = await db
      .select({ id: cloudConnections.id })
      .from(cloudConnections)
      .where(and(eq(cloudConnections.provider, conn.provider), eq(cloudConnections.account, conn.account)));
    if (existing.length > 0) continue;

    await db.insert(cloudConnections).values({
      provider: conn.provider,
      account: conn.account,
      identifier: conn.identifier,
      status: 'active',
      lastCheckedAt: new Date(),
      lastCheckMessage: 'ok (seed)',
      addedByUserId: adminId,
    });
  }

  console.log(`RBAC: seeded bootstrap admin (${adminEmail}) + ${SAMPLE_CONNECTIONS.length} sample connections`);
  await pool.end();
}

main().catch((err) => {
  console.error('RBAC: seed failed', err);
  process.exitCode = 1;
});
