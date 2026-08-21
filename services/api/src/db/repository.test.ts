import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { scans } from "./schema.js";
import { PostgresScanRepository } from "../repository.js";
import { assertSafeTestDatabaseUrl } from "./test-database-guard.js";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const safeDatabaseUrl = databaseUrl
  ? (assertSafeTestDatabaseUrl(databaseUrl), databaseUrl)
  : undefined;
const describeDatabase = safeDatabaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL scan persistence", () => {
  let connection: DatabaseConnection | undefined;
  let repository: PostgresScanRepository;
  const createdIds: string[] = [];

  beforeAll(async () => {
    connection = createDatabase(databaseUrl!);
    await migrate(connection!.db, { migrationsFolder: "drizzle" });
    repository = new PostgresScanRepository(connection!.db);
  });

  afterAll(async () => {
    if (connection && createdIds.length > 0) {
      await connection.db.delete(scans).where(inArray(scans.id, createdIds));
    }
    await connection?.pool.end();
  });

  afterEach(async () => {
    if (connection && createdIds.length > 0) {
      await connection.db.delete(scans).where(inArray(scans.id, createdIds));
      createdIds.length = 0;
    }
  });

  it("persists a scan and retrieves it from a separate repository instance", async () => {
    const scan = {
      id: randomUUID(),
      url: "https://example.com/",
      status: "completed" as const,
      score: 87,
      summary: { critical: 2, warnings: 6, passed: 31 },
      createdAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:00.100Z",
    };

    const created = await repository.create(scan, " HTTPS://Example.com#fragment ");
    createdIds.push(scan.id);
    const secondRepository = new PostgresScanRepository(connection!.db);

    await expect(secondRepository.findById(scan.id)).resolves.toEqual(created);
    expect(created.url).toBe("https://example.com/");
  });

  it("enforces score, count, and status constraints in PostgreSQL", async () => {
    const base = {
      id: randomUUID(),
      requestedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
      status: "completed" as const,
      overallScore: 87,
      criticalCount: 2,
      warningCount: 6,
      passedCount: 31,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      completedAt: new Date("2026-08-20T00:00:00.100Z"),
    };

    await expect(
      connection!.db.insert(scans).values({ ...base, overallScore: 101 }),
    ).rejects.toThrow();
    await expect(
      connection!.db.insert(scans).values({ ...base, id: randomUUID(), criticalCount: -1 }),
    ).rejects.toThrow();
    await expect(
      connection!.db.insert(scans).values({ ...base, id: randomUUID(), status: "unknown" as never }),
    ).rejects.toThrow();
  });

  it("lists persisted scans with stable cursor pagination", async () => {
    const records = [
      {
        id: randomUUID(),
        url: "https://example.com/first",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2099-08-20T00:00:00.000Z",
        completedAt: "2099-08-20T00:00:00.100Z",
      },
      {
        id: randomUUID(),
        url: "https://example.com/second",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2099-08-21T00:00:00.000Z",
        completedAt: "2099-08-21T00:00:00.100Z",
      },
      {
        id: randomUUID(),
        url: "https://example.com/third",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2099-08-22T00:00:00.000Z",
        completedAt: "2099-08-22T00:00:00.100Z",
      },
    ];
    for (const record of records) {
      await repository.create(record);
      createdIds.push(record.id);
    }

    const firstPage = await repository.list({ limit: 2 });
    expect(firstPage.items.map((scan) => scan.url)).toEqual([
      records[2].url,
      records[1].url,
    ]);
    expect(firstPage.nextPosition).toEqual({
      createdAt: records[1].createdAt,
      id: records[1].id,
    });

    const secondPage = await repository.list({ limit: 2, before: firstPage.nextPosition! });
    expect(secondPage.items.map((scan) => scan.url)).toEqual([records[0].url]);
    expect(secondPage.nextPosition).toBeNull();
  });

  it("searches persisted URL forms with literal matching", async () => {
    const records = [
      {
        id: randomUUID(),
        url: "https://db-search.example/percent%value_under_score",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2100-08-20T00:00:00.000Z",
        completedAt: "2100-08-20T00:00:00.100Z",
      },
      {
        id: randomUUID(),
        url: "https://db-search.example/second",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2100-08-21T00:00:00.000Z",
        completedAt: "2100-08-21T00:00:00.100Z",
      },
      {
        id: randomUUID(),
        url: "https://db-search.example/third",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2100-08-22T00:00:00.000Z",
        completedAt: "2100-08-22T00:00:00.100Z",
      },
    ];
    await repository.create(records[0], "https://db-requested.example/back\\slash");
    createdIds.push(records[0].id);
    await repository.create(records[1]);
    createdIds.push(records[1].id);
    await repository.create(records[2]);
    createdIds.push(records[2].id);

    await expect(repository.list({ limit: 10, query: "DB-REQUESTED.EXAMPLE" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: records[0].id })],
    });
    await expect(repository.list({ limit: 10, query: "%" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: records[0].id })],
    });
    await expect(repository.list({ limit: 10, query: "_" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: records[0].id })],
    });
    await expect(repository.list({ limit: 2, query: "db-search.example" })).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: records[2].id }),
        expect.objectContaining({ id: records[1].id }),
      ],
      nextPosition: {
        createdAt: records[1].createdAt,
        id: records[1].id,
      },
    });
  });
});
