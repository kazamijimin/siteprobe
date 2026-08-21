import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { qaEvaluations } from "./schema.js";
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js";
import {
  PostgresQaEvaluationRepository,
  QaEvaluationConflictError,
  QaEvaluationPersistenceCorruptionError,
} from "../evaluations/repository.js";
import type { ControlledQaEvaluationCreate } from "@siteprobe/contracts";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const safeDatabaseUrl = databaseUrl
  ? (assertSafeTestDatabaseUrl(databaseUrl), databaseUrl)
  : undefined;
const describeDatabase = safeDatabaseUrl ? describe : describe.skip;

function input(scannerRunId = randomUUID()): ControlledQaEvaluationCreate {
  return {
    schemaVersion: 1, evaluatorVersion: 1, scannerRunId,
    requestedUrl: "https://db-evaluation.example/", finalUrl: null,
    scannedAt: "2026-08-20T00:00:00.000Z",
    evaluation: {
      findings: [
        { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "failed", severity: "critical", title: "Navigation completed", description: "failed", evidence: { kind: "navigation", navigationSucceeded: false, failureCode: "NAVIGATION_FAILED", requestedUrl: "https://db-evaluation.example/", finalUrl: null, navigationDurationMs: 3 } },
        { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "notApplicable", severity: "info", title: "HTTP status acceptable", description: "n/a", evidence: { kind: "httpStatus", value: null } },
        { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "notApplicable", severity: "info", title: "Document title present", description: "n/a", evidence: { kind: "title", present: false, characterCount: 0 } },
        { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "notApplicable", severity: "info", title: "No console errors", description: "n/a", evidence: { kind: "messages", recordedCount: 3, samples: ["console sample 1", "console sample 2", "console sample 3"], samplesTruncated: true } },
        { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "notApplicable", severity: "info", title: "No page errors", description: "n/a", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
        { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "notApplicable", severity: "info", title: "No failed requests", description: "n/a", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
      ],
      summary: { critical: 1, warnings: 0, passed: 0, notApplicable: 5 },
    },
  };
}

describeDatabase("PostgreSQL QA evaluation persistence", () => {
  let connection: DatabaseConnection;
  let repository: PostgresQaEvaluationRepository;
  const ids: string[] = [];

  beforeAll(async () => {
    connection = createDatabase(databaseUrl!);
    await migrate(connection.db, { migrationsFolder: "drizzle" });
    repository = new PostgresQaEvaluationRepository(connection.db);
  });

  afterAll(async () => {
    if (ids.length > 0) await connection.db.delete(qaEvaluations).where(inArray(qaEvaluations.id, ids));
    await connection.pool.end();
  });

  it("persists JSONB evaluation, reads through a separate repository, and enforces uniqueness", async () => {
    const value = input();
    const created = await repository.create(value);
    ids.push(created.evaluation.id);
    expect(created.created).toBe(true);
    const second = new PostgresQaEvaluationRepository(connection.db);
    await expect(second.findById(created.evaluation.id)).resolves.toMatchObject({
      id: created.evaluation.id,
      finalUrl: null,
      evaluation: value.evaluation,
      scannedAt: new Date(value.scannedAt).toISOString(),
    });
    expect(Date.parse(created.evaluation.createdAt)).not.toBeNaN();
    expect(created.evaluation.createdAt).toBe((await second.findById(created.evaluation.id))?.createdAt);
    await expect(repository.findByScannerRun(value.scannerRunId, 1)).resolves.toMatchObject({ id: created.evaluation.id });
    await expect(repository.create(value)).resolves.toMatchObject({ created: false, evaluation: { id: created.evaluation.id } });

    const conflictingValue = {
      ...value,
      evaluation: {
        ...value.evaluation,
        findings: value.evaluation.findings.map((finding, index) => index === 0
          ? { ...finding, description: "a different valid description" }
          : finding),
      },
    };
    await expect(repository.create(conflictingValue)).rejects.toThrow(QaEvaluationConflictError);

    const duplicateId = randomUUID();
    await expect(connection.db.insert(qaEvaluations).values({
      id: duplicateId,
      scannerRunId: value.scannerRunId,
      source: "controlled-scanner",
      schemaVersion: 1,
      evaluatorVersion: 1,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: value.evaluation,
    })).rejects.toThrow();

    const versionTwoId = randomUUID();
    ids.push(versionTwoId);
    await connection.db.insert(qaEvaluations).values({
      id: versionTwoId,
      scannerRunId: value.scannerRunId,
      source: "controlled-scanner",
      schemaVersion: 1,
      evaluatorVersion: 2,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: value.evaluation,
      createdAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    await expect(connection.db.select({ evaluatorVersion: qaEvaluations.evaluatorVersion })
      .from(qaEvaluations)
      .where(inArray(qaEvaluations.scannerRunId, [value.scannerRunId])))
      .resolves.toEqual(expect.arrayContaining([{ evaluatorVersion: 1 }, { evaluatorVersion: 2 }]));
  });

  it("does not expose malformed stored JSON as a validation error", async () => {
    const value = input();
    const created = await repository.create(value);
    ids.push(created.evaluation.id);
    await connection.db.update(qaEvaluations).set({ evaluationJson: {} as never }).where(eq(qaEvaluations.id, created.evaluation.id));
    await expect(repository.findById(created.evaluation.id)).rejects.toThrow(QaEvaluationPersistenceCorruptionError);
    await connection.db.delete(qaEvaluations).where(eq(qaEvaluations.id, created.evaluation.id));
    ids.splice(ids.indexOf(created.evaluation.id), 1);
  });

  it("allows a future evaluator version at the database layer", async () => {
    const value = input();
    const id = randomUUID();
    ids.push(id);
    await connection.db.insert(qaEvaluations).values({
      id,
      scannerRunId: value.scannerRunId,
      source: "controlled-scanner",
      schemaVersion: 1,
      evaluatorVersion: 2,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: value.evaluation,
      createdAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    await expect(connection.db.select({ id: qaEvaluations.id }).from(qaEvaluations).where(eq(qaEvaluations.id, id))).resolves.toHaveLength(1);
  });

  it("lists rows with created-at and UUID keyset pagination", async () => {
    if (ids.length > 0) {
      await connection.db.delete(qaEvaluations).where(inArray(qaEvaluations.id, ids));
      ids.length = 0;
    }
    const value = input();
    const rows = [
      { id: randomUUID(), createdAt: "2099-01-01T00:00:00.000Z" },
      { id: randomUUID(), createdAt: "2099-01-02T00:00:00.000Z" },
      { id: randomUUID(), createdAt: "2099-01-02T00:00:00.000Z" },
    ];
    ids.push(...rows.map((row) => row.id));
    await connection.db.insert(qaEvaluations).values(rows.map((row) => ({
      id: row.id,
      scannerRunId: randomUUID(),
      source: "controlled-scanner" as const,
      schemaVersion: 1,
      evaluatorVersion: 1,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: value.evaluation,
      createdAt: new Date(row.createdAt),
    })));

    const first = await repository.list({ limit: 2 });
    const expectedTieOrder = rows.slice(1).sort((left, right) => left.id > right.id ? -1 : 1);
    expect(first.evaluations.slice(0, 2).map((item) => item.id)).toEqual(expectedTieOrder.map((row) => row.id));
    expect(first.nextPosition).toEqual({ createdAt: first.evaluations[1].createdAt, id: first.evaluations[1].id });

    const second = await repository.list({ limit: 2, before: first.nextPosition! });
    expect(second.evaluations[0].id).toBe(rows[0].id);
    expect(second.nextPosition).toBeNull();
    expect(new Set([...first.evaluations, ...second.evaluations].map((item) => item.id)).size).toBe(3);
  });

  it("fails the entire list when a selected JSONB row is corrupt", async () => {
    const value = input();
    const id = randomUUID();
    ids.push(id);
    await connection.db.insert(qaEvaluations).values({
      id,
      scannerRunId: randomUUID(),
      source: "controlled-scanner",
      schemaVersion: 1,
      evaluatorVersion: 1,
      requestedUrl: value.requestedUrl,
      finalUrl: value.finalUrl,
      scannedAt: new Date(value.scannedAt),
      evaluationJson: {} as never,
      createdAt: new Date("2099-12-31T00:00:00.000Z"),
    });
    await expect(repository.list({ limit: 20 })).rejects.toThrow(QaEvaluationPersistenceCorruptionError);
  });
});
