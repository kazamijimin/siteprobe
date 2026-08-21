import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { accessibilityEvaluations } from "./schema.js";
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js";
import { PostgresAccessibilityEvaluationRepository, AccessibilityEvaluationConflictError, AccessibilityEvaluationPersistenceCorruptionError } from "../accessibility-evaluations/repository.js";
import type { AccessibilityEvaluationCreate } from "@siteprobe/contracts";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const safeDatabaseUrl = databaseUrl ? (assertSafeTestDatabaseUrl(databaseUrl), databaseUrl) : undefined;
const describeDatabase = safeDatabaseUrl ? describe : describe.skip;

function input(scannerRunId = randomUUID()): AccessibilityEvaluationCreate {
  return {
    schemaVersion: 1, evaluatorVersion: 1, scannerRunId,
    requestedUrl: "http://fixture.invalid/accessibility-mixed", finalUrl: "http://fixture.invalid/accessibility-mixed",
    scannedAt: "2026-08-21T00:00:00.000Z", engine: "axe-core", engineVersion: "4.13.0", adapter: "@axe-core/playwright", adapterVersion: "4.13.0",
    rulesetTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    evaluation: {
      status: "completed", summary: { violationRules: 1, violationNodes: 2, critical: 1, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 0, needsReviewNodes: 0 },
      violations: [{ ruleId: "image-alt", impact: "critical", help: "Images must have alternate text", affectedNodeCount: 2, affectedNodeCountCapped: false, samples: [{ target: ["img"], failureSummary: "Fix any of the following" }], samplesTruncated: false }],
      needsReview: [], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false,
    },
  };
}

describeDatabase("PostgreSQL accessibility evaluation persistence", () => {
  let connection: DatabaseConnection;
  let repository: PostgresAccessibilityEvaluationRepository;
  const ids: string[] = [];
  beforeAll(async () => { connection = createDatabase(safeDatabaseUrl!); await migrate(connection.db, { migrationsFolder: "drizzle" }); repository = new PostgresAccessibilityEvaluationRepository(connection.db); });
  afterAll(async () => { if (ids.length) await connection.db.delete(accessibilityEvaluations).where(inArray(accessibilityEvaluations.id, ids)); await connection.pool.end(); });

  it("persists JSONB, reads through a separate repository, and is idempotent", async () => {
    const value = input(); const created = await repository.create(value); ids.push(created.evaluation.id);
    expect(created.created).toBe(true);
    const second = new PostgresAccessibilityEvaluationRepository(connection.db);
    await expect(second.findById(created.evaluation.id)).resolves.toMatchObject({ id: created.evaluation.id, evaluation: value.evaluation, adapter: "@axe-core/playwright" });
    await expect(second.findByScannerRun(value.scannerRunId, 1, "4.13.0")).resolves.toMatchObject({ id: created.evaluation.id });
    await expect(repository.create(value)).resolves.toMatchObject({ created: false, evaluation: { id: created.evaluation.id } });
    await expect(repository.create({ ...value, evaluation: { ...value.evaluation, violations: value.evaluation.violations.map((violation) => ({ ...violation, help: "A different valid help" })) } })).rejects.toThrow(AccessibilityEvaluationConflictError);
  });

  it("keeps engine versions independent and rejects malformed JSONB", async () => {
    const value = input(); const id = randomUUID(); ids.push(id);
    await connection.db.insert(accessibilityEvaluations).values({ id, scannerRunId: value.scannerRunId, source: "controlled-scanner", schemaVersion: 1, evaluatorVersion: 1, engine: "axe-core", engineVersion: "4.12.0", requestedUrl: value.requestedUrl, finalUrl: value.finalUrl, scannedAt: new Date(value.scannedAt), evaluationJson: { evaluation: value.evaluation, adapter: value.adapter, adapterVersion: value.adapterVersion, rulesetTags: value.rulesetTags } });
    await expect(connection.db.select({ id: accessibilityEvaluations.id }).from(accessibilityEvaluations).where(eq(accessibilityEvaluations.id, id))).resolves.toEqual([{ id }]);
    await connection.db.update(accessibilityEvaluations).set({ evaluationJson: {} as never }).where(eq(accessibilityEvaluations.id, id));
    await expect(repository.findById(id)).rejects.toThrow(AccessibilityEvaluationPersistenceCorruptionError);
  });
});
