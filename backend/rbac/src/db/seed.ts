import { sql } from 'drizzle-orm';
import { env } from '../env.js';
import { db, pool } from './client.js';
import { users } from './schema.js';

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
        .values({ email: adminEmail, name: 'Administrator', role: 'admin', status: 'pending' })
        .returning()
    )[0]?.id;

  if (!adminId) throw new Error('seed: could not resolve bootstrap admin id');

  console.log(`RBAC: seeded bootstrap admin (${adminEmail})`);
  await pool.end();
}

main().catch((err) => {
  console.error('RBAC: seed failed', err);
  process.exitCode = 1;
});
