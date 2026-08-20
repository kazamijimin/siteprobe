import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { errorEnvelopeSchema, scanResponseSchema } from "@siteprobe/contracts";
import { buildApp } from "./app.js";

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
