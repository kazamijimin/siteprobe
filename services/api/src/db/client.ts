import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type SiteProbeDatabase = NodePgDatabase<typeof schema>;

export type DatabaseConnection = {
  db: SiteProbeDatabase;
  pool: Pool;
};

export function createDatabase(databaseUrl: string): DatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
  });
  return { db: drizzle(pool, { schema }), pool };
}
