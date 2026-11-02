// Applies pending SQL migrations from ./migrations. Runs before every deploy.
//
// Databases created before migrations existed (schema made by `drizzle-kit push`)
// already contain the baseline tables. For those, the baseline migration is
// recorded as applied instead of run, so only newer migrations execute.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

const pool = new pg.Pool({ connectionString: url });

async function adoptExistingDatabase(client) {
  const { rows: tracked } = await client.query(
    `SELECT to_regclass('"${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"') AS t`,
  );
  if (tracked[0].t) return;

  const { rows: existing } = await client.query(`SELECT to_regclass('public.users') AS t`);
  if (!existing[0].t) return; // empty database: run every migration from scratch

  const [baseline] = readMigrationFiles({ migrationsFolder });
  if (!baseline) return;

  console.log("Existing schema without migration history: recording the baseline as applied");
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
  await client.query(`INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`, [
    baseline.hash,
    baseline.folderMillis,
  ]);
}

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await adoptExistingDatabase(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await migrate(drizzle(pool), {
    migrationsFolder,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  });
  console.log("Migrations up to date");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
