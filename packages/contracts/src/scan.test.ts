import { describe, expect, it } from "vitest";
import {
  createScanRequestSchema,
  errorEnvelopeSchema,
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
});
