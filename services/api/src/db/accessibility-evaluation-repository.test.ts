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

  it("returns an empty page when the test table has no inserted rows", async () => {
    const page = await repository.list({ limit: 20, before: { createdAt: "1900-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000000" } });
    expect(page.evaluations).toEqual([]);
    expect(page.nextPosition).toBeNull();
  });

  it("implements createdAt/id keyset pagination with limit plus one", async () => {
    const rowIds = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    const createdAt = new Date("2026-08-21T00:02:00.000Z");
    for (const [index, id] of rowIds.entries()) {
      const value = input(randomUUID());
      await connection.db.insert(accessibilityEvaluations).values({
        id,
        scannerRunId: value.scannerRunId,
        source: "controlled-scanner",
        schemaVersion: value.schemaVersion,
        evaluatorVersion: value.evaluatorVersion,
        engine: value.engine,
        engineVersion: value.engineVersion,
        requestedUrl: value.requestedUrl,
        finalUrl: value.finalUrl,
        scannedAt: new Date(value.scannedAt),
        evaluationJson: { evaluation: value.evaluation, adapter: value.adapter, adapterVersion: value.adapterVersion, rulesetTags: value.rulesetTags },
        createdAt: new Date(createdAt.getTime() + index * 0),
      });
    }
    const first = await repository.list({ limit: 2 });
    expect(first.evaluations.map((item) => item.id)).toEqual([rowIds[2], rowIds[1]]);
    expect(first.nextPosition).toEqual({ createdAt: createdAt.toISOString(), id: rowIds[1] });
    const second = await repository.list({ limit: 2, before: first.nextPosition! });
    expect(second.evaluations.map((item) => item.id)).toEqual([rowIds[0]]);
    expect(second.nextPosition).toBeNull();
    expect(new Set([...first.evaluations, ...second.evaluations].map((item) => item.id)).size).toBe(3);
    await connection.db.delete(accessibilityEvaluations).where(inArray(accessibilityEvaluations.id, rowIds));
  });

  it("does not skip corrupt rows during list reads", async () => {
    const id = "00000000-0000-4000-8000-000000000011";
    const value = input(randomUUID());
    await connection.db.insert(accessibilityEvaluations).values({
      id,
      scannerRunId: value.scannerRunId,
      source: "controlled-scanner",
      schemaVersion: value.schemaVersion,
      evaluatorVersion: value.evaluatorVersion,
      engine: value.engine,
      engineVersion: value.engineVersion,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: {} as never,
      createdAt: new Date("2026-08-21T00:03:00.000Z"),
    });
    await expect(repository.list({ limit: 20 })).rejects.toThrow(AccessibilityEvaluationPersistenceCorruptionError);
    await connection.db.delete(accessibilityEvaluations).where(eq(accessibilityEvaluations.id, id));
  });

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
