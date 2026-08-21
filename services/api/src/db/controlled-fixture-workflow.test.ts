import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runControlledEvaluationWorkflow } from "@siteprobe/controlled-evaluations";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { qaEvaluations } from "./schema.js";
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js";
import { buildApp } from "../app.js";
import { PostgresQaEvaluationRepository } from "../evaluations/repository.js";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const safeDatabaseUrl = databaseUrl
  ? (assertSafeTestDatabaseUrl(databaseUrl), databaseUrl)
  : undefined;
const describeDatabase = safeDatabaseUrl ? describe : describe.skip;

describeDatabase("P7 controlled fixture to PostgreSQL workflow", () => {
  let connection: DatabaseConnection;
  let app: ReturnType<typeof buildApp>;
  let apiOrigin: URL;
  const evaluationIds: string[] = [];

  beforeAll(async () => {
    connection = createDatabase(safeDatabaseUrl!);
    await migrate(connection.db, { migrationsFolder: "drizzle" });
    app = buildApp({
      logger: false,
      qaEvaluationRepository: new PostgresQaEvaluationRepository(connection.db),
      qaEvaluationInternalToken: "p7-test-only-ingestion-token",
      qaEvaluationPublicReadEnabled: true,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("P7 test API did not bind a TCP port");
    apiOrigin = new URL(`http://127.0.0.1:${address.port}`);
  });

  afterAll(async () => {
    if (evaluationIds.length > 0) {
      await connection.db.delete(qaEvaluations).where(inArray(qaEvaluations.id, evaluationIds));
    }
    await app.close();
    await connection.pool.end();
  });

  it("persists a real controlled fixture and retrieves it through P6 and P5", async () => {
    const workflow = await runControlledEvaluationWorkflow(
      { apiUrl: apiOrigin, internalToken: "p7-test-only-ingestion-token" },
      "healthy",
    );
    evaluationIds.push(workflow.persistedEvaluation.id);

    expect(workflow.scannerResult.scanId).toBe(workflow.persistedEvaluation.scannerRunId);
    expect(workflow.persistedEvaluation.evaluation.summary).toEqual({ critical: 0, warnings: 0, passed: 6, notApplicable: 0 });

    const listResponse = await fetch(new URL("/api/qa-evaluations", apiOrigin));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { evaluations: Array<{ id: string }> };
    expect(list.evaluations.some((evaluation) => evaluation.id === workflow.persistedEvaluation.id)).toBe(true);

    const detailResponse = await fetch(new URL(`/api/qa-evaluations/${workflow.persistedEvaluation.id}`, apiOrigin));
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()).id).toBe(workflow.persistedEvaluation.id);
  });
});
