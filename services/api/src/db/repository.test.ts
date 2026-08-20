import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseConnection } from "./client.js";
import { scans } from "./schema.js";
import { PostgresScanRepository } from "../repository.js";

const databaseUrl = process.env.SITEPROBE_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL scan persistence", () => {
  let connection: DatabaseConnection;
  let repository: PostgresScanRepository;

  beforeAll(async () => {
    connection = createDatabase(databaseUrl!);
    await migrate(connection.db, { migrationsFolder: "drizzle" });
    repository = new PostgresScanRepository(connection.db);
  });

  afterAll(async () => {
    await connection.pool.end();
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
    const secondRepository = new PostgresScanRepository(connection.db);

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
      connection.db.insert(scans).values({ ...base, overallScore: 101 }),
    ).rejects.toThrow();
    await expect(
      connection.db.insert(scans).values({ ...base, id: randomUUID(), criticalCount: -1 }),
    ).rejects.toThrow();
    await expect(
      connection.db.insert(scans).values({ ...base, id: randomUUID(), status: "unknown" as never }),
    ).rejects.toThrow();
  });
});
