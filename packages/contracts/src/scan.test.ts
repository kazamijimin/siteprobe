import { describe, expect, it } from "vitest";
import {
  createScanRequestSchema,
  errorEnvelopeSchema,
  listScansQuerySchema,
  listScansResponseSchema,
  scanCursorPayloadSchema,
  scanCursorSchema,
  scanResponseSchema,
} from "./scan.js";

describe("scan contracts", () => {
  it("normalizes a valid URL and removes its fragment", () => {
    const result = createScanRequestSchema.parse({
      url: "  HTTPS://Example.COM/path?q=1#section  ",
    });

    expect(result.url).toBe("https://example.com/path?q=1");
  });

  it.each([
    ["missing scheme", "example.com"],
    ["unsupported protocol", "ftp://example.com"],
    ["credentials", "https://user:pass@example.com"],
    ["missing hostname", "https://"],
    ["empty", "   "],
  ])("rejects %s", (_label, url) => {
    expect(() => createScanRequestSchema.parse({ url })).toThrow();
  });

  it("rejects unexpected request fields and overlong URLs", () => {
    expect(() =>
      createScanRequestSchema.parse({ url: "https://example.com", extra: true }),
    ).toThrow();
    expect(() =>
      createScanRequestSchema.parse({ url: `https://example.com/${"a".repeat(2048)}` }),
    ).toThrow();
  });

  it("accepts a completed response with a nullable score", () => {
    const result = scanResponseSchema.parse({
      id: "00000000-0000-4000-8000-000000000000",
      url: "https://example.com/",
      status: "completed",
      score: null,
      summary: { critical: 0, warnings: 1, passed: 2 },
      createdAt: "2026-08-20T00:00:00.000Z",
      completedAt: null,
    });

    expect(result.status).toBe("completed");
  });

  it("rejects invalid score and summary values", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000000",
      url: "https://example.com/",
      status: "completed",
      score: 101,
      summary: { critical: 0, warnings: 1, passed: 2 },
      createdAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:00.000Z",
    };
    expect(() => scanResponseSchema.parse(base)).toThrow();
    expect(() =>
      scanResponseSchema.parse({ ...base, score: 50, summary: { critical: -1, warnings: 1, passed: 2 } }),
    ).toThrow();
    expect(() => scanResponseSchema.parse({ ...base, score: 50, status: "unknown" })).toThrow();
  });

  it("keeps the error envelope stable", () => {
    expect(
      errorEnvelopeSchema.parse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          requestId: "req-1",
          details: [{ path: "url", message: "URL is required" }],
        },
      }).error.code,
    ).toBe("VALIDATION_ERROR");
    expect(() =>
      errorEnvelopeSchema.parse({ error: { code: "NOT_FOUND", message: "missing" } }),
    ).toThrow();
  });

  it("validates history query limits and strict fields", () => {
    expect(listScansQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listScansQuerySchema.parse({ limit: "1" }).limit).toBe(1);
    expect(listScansQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    for (const limit of ["0", "51", "1.5", "not-a-number"]) {
      expect(() => listScansQuerySchema.parse({ limit })).toThrow();
    }
    expect(() => listScansQuerySchema.parse({ unexpected: "value" })).toThrow();
  });

  it("validates cursor payloads and history responses", () => {
    const payload = {
      v: 1,
      createdAt: "2026-08-20T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000000",
    };
    expect(scanCursorPayloadSchema.parse(payload)).toEqual(payload);
    expect(scanCursorSchema.parse("abc_-123")).toBe("abc_-123");
    expect(() => scanCursorSchema.parse("not-valid!")).toThrow();
    expect(() => scanCursorSchema.parse(" abc_-123 ")).toThrow();
    expect(() => scanCursorSchema.parse("a".repeat(513))).toThrow();
    expect(() => scanCursorPayloadSchema.parse({ ...payload, v: 2 })).toThrow();
    expect(() => scanCursorPayloadSchema.parse({ ...payload, id: "bad" })).toThrow();
    expect(listScansResponseSchema.parse({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(() => listScansResponseSchema.parse({ items: [{ id: "bad" }], nextCursor: null })).toThrow();
    const validItem = {
      id: "00000000-0000-4000-8000-000000000000",
      url: "https://example.com/",
      status: "completed",
      score: 87,
      summary: { critical: 2, warnings: 6, passed: 31 },
      createdAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:00.100Z",
    };
    expect(() => listScansResponseSchema.parse({ items: Array.from({ length: 51 }, () => validItem), nextCursor: null })).toThrow();
  });
});
