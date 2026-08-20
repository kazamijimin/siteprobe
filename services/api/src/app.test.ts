import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { errorEnvelopeSchema, listScansResponseSchema, scanResponseSchema } from "@siteprobe/contracts";
import { buildApp } from "./app.js";
import { InMemoryScanRepository } from "./repository.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function testApp() {
  const app = buildApp();
  apps.push(app);
  return app;
}

describe("SiteProbe fake API", () => {
  it("reports health", async () => {
    const response = await testApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("allows the local Expo web client to call the API", async () => {
    const app = testApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/scans",
      headers: {
        origin: "http://localhost:8082",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8082");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("creates a deterministic synthetic completed scan", async () => {
    const response = await testApp().inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: " HTTPS://Example.com/path#fragment " },
    });
    expect(response.statusCode).toBe(201);
    const scan = scanResponseSchema.parse(response.json());
    expect(scan.url).toBe("https://example.com/path");
    expect(scan.status).toBe("completed");
    expect(scan.score).toBe(87);
    expect(scan.summary).toEqual({ critical: 2, warnings: 6, passed: 31 });
  });

  it("does not invoke an injected scanner client from the public scan route", async () => {
    let calls = 0;
    const app = buildApp({
      scannerClient: {
        scan: async () => {
          calls += 1;
          throw new Error("public route must remain synthetic");
        },
      },
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: "https://example.com" },
    });
    expect(response.statusCode).toBe(201);
    expect(calls).toBe(0);
  });

  it("stores and retrieves a scan by UUID", async () => {
    const app = testApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: "https://example.com" },
    });
    const id = scanResponseSchema.parse(created.json()).id;
    const response = await app.inject({ method: "GET", url: `/api/scans/${id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(id);
  });

  it("lists persisted scans newest-first with cursor pagination", async () => {
    const repository = new InMemoryScanRepository();
    const scans = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        url: "https://example.com/one",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2026-08-20T00:00:00.000Z",
        completedAt: "2026-08-20T00:00:00.100Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        url: "https://example.com/two",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2026-08-20T00:00:00.000Z",
        completedAt: "2026-08-20T00:00:00.100Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        url: "https://example.com/three",
        status: "completed" as const,
        score: 87,
        summary: { critical: 2, warnings: 6, passed: 31 },
        createdAt: "2026-08-21T00:00:00.000Z",
        completedAt: "2026-08-21T00:00:00.100Z",
      },
    ];
    for (const scan of scans) {
      repository.create(scan);
    }

    const app = buildApp({ repository });
    apps.push(app);
    const first = await app.inject({ method: "GET", url: "/api/scans?limit=2" });
    expect(first.statusCode).toBe(200);
    const firstPage = listScansResponseSchema.parse(first.json());
    expect(firstPage.items.map((scan) => scan.id)).toEqual([
      scans[2].id,
      scans[1].id,
    ]);
    expect(firstPage.nextCursor).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/api/scans?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(second.statusCode).toBe(200);
    expect(listScansResponseSchema.parse(second.json())).toEqual({
      items: [scans[0]],
      nextCursor: null,
    });
  });

  it("searches both stored URL forms with literal case-insensitive matching", async () => {
    const repository = new InMemoryScanRepository();
    const matchingScan = {
      id: "00000000-0000-4000-8000-000000000011",
      url: "https://canonical.example/path",
      status: "completed" as const,
      score: 87,
      summary: { critical: 2, warnings: 6, passed: 31 },
      createdAt: "2026-08-21T00:00:00.000Z",
      completedAt: "2026-08-21T00:00:00.100Z",
    };
    const literalScan = {
      id: "00000000-0000-4000-8000-000000000012",
      url: "https://literal.example/percent%value_under_score",
      status: "completed" as const,
      score: 87,
      summary: { critical: 2, warnings: 6, passed: 31 },
      createdAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:00.100Z",
    };
    repository.create(matchingScan, "HTTPS://Requested.Example/original");
    repository.create(literalScan, "https://literal.example/back\\slash");

    const app = buildApp({ repository });
    apps.push(app);

    const normalizedMatch = await app.inject({ method: "GET", url: "/api/scans?q=CANONICAL.EXAMPLE" });
    expect(normalizedMatch.statusCode).toBe(200);
    expect(normalizedMatch.json().items.map((scan: { id: string }) => scan.id)).toEqual([matchingScan.id]);

    const requestedMatch = await app.inject({ method: "GET", url: "/api/scans?q=requested.example" });
    expect(requestedMatch.statusCode).toBe(200);
    expect(requestedMatch.json().items.map((scan: { id: string }) => scan.id)).toEqual([matchingScan.id]);

    const percentMatch = await app.inject({ method: "GET", url: "/api/scans?q=%25" });
    expect(percentMatch.statusCode).toBe(200);
    expect(percentMatch.json().items.map((scan: { id: string }) => scan.id)).toEqual([literalScan.id]);

    const underscoreMatch = await app.inject({ method: "GET", url: "/api/scans?q=_" });
    expect(underscoreMatch.statusCode).toBe(200);
    expect(underscoreMatch.json().items.map((scan: { id: string }) => scan.id)).toEqual([literalScan.id]);

    const backslashMatch = await app.inject({ method: "GET", url: "/api/scans?q=%5C" });
    expect(backslashMatch.statusCode).toBe(200);
    expect(backslashMatch.json().items.map((scan: { id: string }) => scan.id)).toEqual([literalScan.id]);

    const noMatch = await app.inject({ method: "GET", url: "/api/scans?q=does-not-exist" });
    expect(noMatch.statusCode).toBe(200);
    expect(noMatch.json()).toEqual({ items: [], nextCursor: null });
  });

  it("keeps searched cursor pagination stable and rejects a mismatched query", async () => {
    const repository = new InMemoryScanRepository();
    const records = [
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000022",
      "00000000-0000-4000-8000-000000000023",
    ].map((id) => ({
      id,
      url: `https://example.com/${id.slice(-2)}`,
      status: "completed" as const,
      score: 87,
      summary: { critical: 2, warnings: 6, passed: 31 },
      createdAt: "2026-08-21T00:00:00.000Z",
      completedAt: "2026-08-21T00:00:00.100Z",
    }));
    for (const record of records) {
      repository.create(record);
    }

    const app = buildApp({ repository });
    apps.push(app);
    const first = await app.inject({ method: "GET", url: "/api/scans?limit=1&q=Example" });
    expect(first.statusCode).toBe(200);
    const firstPage = listScansResponseSchema.parse(first.json());
    expect(firstPage.items.map((scan) => scan.id)).toEqual([records[2].id]);
    expect(firstPage.nextCursor).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/api/scans?limit=1&q=Example&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(second.statusCode).toBe(200);
    expect(listScansResponseSchema.parse(second.json()).items.map((scan) => scan.id)).toEqual([records[1].id]);

    const mismatch = await app.inject({
      method: "GET",
      url: `/api/scans?limit=1&q=other&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    });
    expect(mismatch.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(mismatch.json()).error.details).toEqual([
      { path: "cursor", message: "Cursor does not match the current search query" },
    ]);
  });

  it("returns an empty history page and validates list queries", async () => {
    const app = testApp();
    const empty = await app.inject({ method: "GET", url: "/api/scans" });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ items: [], nextCursor: null });

    for (const url of [
      "/api/scans?limit=0",
      "/api/scans?limit=51",
      "/api/scans?limit=1.5",
      "/api/scans?limit=not-a-number",
      "/api/scans?limit=20&limit=21",
      "/api/scans?unexpected=value",
      "/api/scans?q=a%00b",
      `/api/scans?q=${"a".repeat(201)}`,
      "/api/scans?q=one&q=two",
      "/api/scans?cursor=not-valid!!",
    ]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("does not invoke an injected scanner client from the public history route", async () => {
    let calls = 0;
    const app = buildApp({
      scannerClient: {
        scan: async () => {
          calls += 1;
          throw new Error("history route must remain database-only");
        },
      },
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/scans?q=example" });
    expect(response.statusCode).toBe(200);
    expect(calls).toBe(0);
  });

  it("returns stable validation and not-found envelopes", async () => {
    const app = testApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: "ftp://example.com", extra: true },
    });
    expect(invalid.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(invalid.json()).error.code).toBe("VALIDATION_ERROR");

    for (const payload of [
      {},
      { url: 42 },
      { url: "https://user:password@example.com" },
      { url: "https://example.com/" + "a".repeat(2048) },
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/scans", payload });
      expect(response.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
    }

    const missing = await app.inject({ method: "GET", url: `/api/scans/${randomUUID()}` });
    expect(missing.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(missing.json()).error.code).toBe("NOT_FOUND");

    const malformedId = await app.inject({ method: "GET", url: "/api/scans/not-a-uuid" });
    expect(malformedId.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(malformedId.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("handles unsupported media, malformed JSON, and oversized payloads", async () => {
    const app = testApp();
    const unsupported = await app.inject({
      method: "POST",
      url: "/api/scans",
      headers: { "content-type": "text/plain" },
      payload: "https://example.com",
    });
    expect(unsupported.statusCode).toBe(415);
    expect(errorEnvelopeSchema.parse(unsupported.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const malformed = await app.inject({
      method: "POST",
      url: "/api/scans",
      headers: { "content-type": "application/json" },
      payload: "{not-json",
    });
    expect(malformed.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(malformed.json()).error.code).toBe("VALIDATION_ERROR");

    const oversized = await app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: "https://example.com", padding: "x".repeat(17_000) },
    });
    expect(oversized.statusCode).toBe(413);
    expect(errorEnvelopeSchema.parse(oversized.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
