import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

async function main() {
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('RBAC: migrations applied');
  await pool.end();
}

main().catch((err) => {
  console.error('RBAC: migration failed', err);
  process.exitCode = 1;
});
