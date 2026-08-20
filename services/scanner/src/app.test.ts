import { scannerResultSchema } from "@siteprobe/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildScannerApp } from "./app.js";
import type { ScannerConfig } from "./config.js";
import { runScan } from "./scan/run-scan.js";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "./testing/fixtures.js";
import { requiredIsolationCapabilities, type IsolationCapabilities } from "./isolation/capabilities.js";

const token = "scanner-test-token";
const scanId = "5d41977d-ffb9-4388-af0a-0f74c8ee64ab";
const apps: ReturnType<typeof buildScannerApp>[] = [];

function config(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  const isolationCapabilities = Object.fromEntries(
    requiredIsolationCapabilities.map((name) => [name, "not-verified"]),
  ) as IsolationCapabilities;
  return {
    host: "127.0.0.1",
    port: 3100,
    internalToken: token,
    executionMode: "controlled",
    controlledHosts: ["fixture.invalid"],
    isolationCapabilities,
    ...overrides,
  };
}

function scannerApp(
  scanner = (input: { scanId: string; url: string }) =>
    runScan(input, { resolver: fixtureResolver, testOnlyRouteHandler: fixtureRouteHandler }),
  scannerConfig = config(),
) {
  const app = buildScannerApp({ config: scannerConfig, runScan: scanner });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("private scanner HTTP worker", () => {
  it("separates liveness from unrestricted readiness", async () => {
    const app = scannerApp();
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "not-ready", reason: "CONTROLLED_MODE_ONLY" });
  });

  it("requires the internal bearer token before calling the runner", async () => {
    let calls = 0;
    const app = scannerApp(async () => {
      calls += 1;
      throw new Error("must not run");
    });
    for (const headers of [{}, { authorization: "Bearer wrong" }]) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/scans",
        headers,
        payload: { scanId, url: FIXTURE_URL },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    }
    expect(calls).toBe(0);
  });

  it("rejects malformed and oversized internal requests", async () => {
    const app = scannerApp(async () => { throw new Error("must not run"); });
    const malformed = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId: "not-a-uuid", url: FIXTURE_URL, extra: true },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("INVALID_REQUEST");

    const invalidJson = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: "{invalid-json",
    });
    expect(invalidJson.statusCode).toBe(400);
    expect(invalidJson.json().error.code).toBe("INVALID_REQUEST");

    const oversized = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: FIXTURE_URL, padding: "x".repeat(17_000) },
    });
    expect(oversized.statusCode).toBe(413);
  });

  it("enforces exact controlled hosts before the runner", async () => {
    let calls = 0;
    const app = scannerApp(async () => {
      calls += 1;
      throw new Error("must not run");
    });
    const response = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: "https://not-allowed.example/" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CONTROLLED_TARGET_NOT_ALLOWED");
    expect(calls).toBe(0);
  });

  it("runs an authenticated controlled fixture and returns ScannerResult", async () => {
    const app = scannerApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: FIXTURE_URL },
    });
    expect(response.statusCode).toBe(200);
    expect(scannerResultSchema.parse(response.json()).pageTitle).toBe("Fixture Page");
  });

  it("fails closed in isolated mode without verified capabilities", async () => {
    let calls = 0;
    const app = scannerApp(async () => {
      calls += 1;
      throw new Error("must not run");
    }, config({ executionMode: "isolated" }));
    const response = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: "https://example.com/" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("ISOLATION_NOT_READY");
    expect(calls).toBe(0);
  });

  it("rejects a second scan while one worker slot is active", async () => {
    let release!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const app = scannerApp(async () => {
      await running;
      return scannerResultSchema.parse({
        scanId,
        requestedUrl: FIXTURE_URL,
        finalUrl: FIXTURE_URL,
        navigationSucceeded: true,
        httpStatus: 200,
        pageTitle: "Busy Fixture",
        navigationDurationMs: 1,
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        scannedAt: new Date().toISOString(),
      });
    });
    const request = app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: FIXTURE_URL },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const busy = await app.inject({
      method: "POST",
      url: "/internal/scans",
      headers: { authorization: `Bearer ${token}` },
      payload: { scanId, url: FIXTURE_URL },
    });
    expect(busy.statusCode).toBe(503);
    expect(busy.json().error.code).toBe("SCANNER_BUSY");
    release();
    expect((await request).statusCode).toBe(200);
  });
});
