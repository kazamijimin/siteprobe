import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runControlledAccessibilityWorkflow } from "@siteprobe/controlled-evaluations";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { accessibilityEvaluations, qaEvaluations } from "./schema.js";
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js";
import { buildApp } from "../app.js";
import { PostgresQaEvaluationRepository } from "../evaluations/repository.js";
import { PostgresAccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import { accessibilityEvaluationResponseSchema } from "@siteprobe/contracts";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const safeDatabaseUrl = databaseUrl ? (assertSafeTestDatabaseUrl(databaseUrl), databaseUrl) : undefined;
const describeDatabase = safeDatabaseUrl ? describe : describe.skip;

describeDatabase("P8 controlled accessibility workflow", () => {
  let connection: DatabaseConnection; let app: ReturnType<typeof buildApp>; let apiOrigin: URL;
  const qaIds: string[] = []; const accessibilityIds: string[] = [];
  beforeAll(async () => {
    connection = createDatabase(safeDatabaseUrl!); await migrate(connection.db, { migrationsFolder: "drizzle" });
    app = buildApp({ logger: false, qaEvaluationRepository: new PostgresQaEvaluationRepository(connection.db), accessibilityEvaluationRepository: new PostgresAccessibilityEvaluationRepository(connection.db), qaEvaluationInternalToken: "p8-test-only-ingestion-token" });
    await app.listen({ host: "127.0.0.1", port: 0 }); const address = app.server.address(); if (!address || typeof address === "string") throw new Error("P8 test API did not bind"); apiOrigin = new URL(`http://127.0.0.1:${address.port}`);
  });
  afterAll(async () => { if (qaIds.length) await connection.db.delete(qaEvaluations).where(inArray(qaEvaluations.id, qaIds)); if (accessibilityIds.length) await connection.db.delete(accessibilityEvaluations).where(inArray(accessibilityEvaluations.id, accessibilityIds)); await app.close(); await connection.pool.end(); });
  it("persists core and accessibility evaluations atomically in one controlled run", async () => {
    const result = await runControlledAccessibilityWorkflow({ apiUrl: apiOrigin, internalToken: "p8-test-only-ingestion-token" }, "accessibility-mixed");
    qaIds.push(result.persistedEvaluation.id); accessibilityIds.push(result.persistedAccessibilityEvaluation!.id);
    expect(result.scannerResult.scanId).toBe(result.persistedEvaluation.scannerRunId);
    expect(result.scannerResult.scanId).toBe(result.persistedAccessibilityEvaluation!.scannerRunId);
    expect(result.accessibility.status).toBe("completed");
    if (result.accessibility.status === "completed") {
      expect(result.accessibility.evaluation.violations.map((v) => v.ruleId)).toEqual(expect.arrayContaining(["image-alt", "html-has-lang", "label"]));
      expect(result.accessibility.evaluation.summary.critical).toBeGreaterThan(0); expect(result.accessibility.evaluation.summary.serious).toBeGreaterThan(0);
      expect(result.accessibility.evaluation.violations.find((v) => v.ruleId === "image-alt")).toMatchObject({ affectedNodeCount: 5, samples: expect.any(Array), samplesTruncated: true });
    }
    const response = await fetch(new URL(`/internal/accessibility-evaluations/${result.persistedAccessibilityEvaluation!.id}`, apiOrigin), { headers: { authorization: "Bearer p8-test-only-ingestion-token" } });
    expect(response.status).toBe(200); expect(accessibilityEvaluationResponseSchema.parse(await response.json()).id).toBe(result.persistedAccessibilityEvaluation!.id);
  });
});
