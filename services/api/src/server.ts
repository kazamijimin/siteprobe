import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { PostgresScanRepository } from "./repository.js";
import { PostgresQaEvaluationRepository } from "./evaluations/repository.js";
import { PostgresAccessibilityEvaluationRepository } from "./accessibility-evaluations/repository.js";

let config;
try {
  config = loadConfig();
} catch {
  console.error("SiteProbe API configuration is invalid. Check HOST, PORT, and DATABASE_URL.");
  process.exit(1);
}

const connection = createDatabase(config.databaseUrl);
const app = buildApp({
  logger: true,
  repository: new PostgresScanRepository(connection.db),
  qaEvaluationRepository: new PostgresQaEvaluationRepository(connection.db),
  qaEvaluationInternalToken: config.qaEvaluationInternalToken,
  qaEvaluationPublicReadEnabled: config.qaEvaluationPublicReadEnabled,
  accessibilityEvaluationRepository: new PostgresAccessibilityEvaluationRepository(connection.db),
  accessibilityEvaluationPublicReadEnabled: config.accessibilityEvaluationPublicReadEnabled,
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down SiteProbe API");
  await app.close();
  await connection.pool.end();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await connection.pool.query("select 1");
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  await connection.pool.end();
  process.exitCode = 1;
}
