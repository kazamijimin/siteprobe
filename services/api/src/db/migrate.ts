import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "../config.js";
import { createDatabase } from "./client.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl);

try {
  await migrate(connection.db, {
    migrationsFolder: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
  });
} finally {
  await connection.pool.end();
}
