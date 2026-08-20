import { describe, expect, it } from "vitest";

import { createScannerClient, ScannerClientError } from "./client.js";

const scanResult = {
  scanId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  navigationSucceeded: true,
  httpStatus: 200,
  pageTitle: "Fixture Page",
  navigationDurationMs: 1,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  scannedAt: "2026-08-20T00:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const input = { scanId: scanResult.scanId, url: scanResult.requestedUrl };

describe("API scanner client", () => {
  it("sends the authenticated internal contract and validates the result", async () => {
    let request: Request | undefined;
    const client = createScannerClient({
      baseUrl: "http://127.0.0.1:3100",
      internalToken: "server-token",
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return response(scanResult);
      },
    });
    await expect(client.scan(input)).resolves.toMatchObject({ pageTitle: "Fixture Page" });
    expect(request?.url).toBe("http://127.0.0.1:3100/internal/scans");
    expect(request?.headers.get("authorization")).toBe("Bearer server-token");
  });

  it("maps scanner errors and malformed responses safely", async () => {
    const client = createScannerClient({
      baseUrl: "http://127.0.0.1:3100",
      internalToken: "server-token",
      fetchImpl: async () => response({ error: { code: "ISOLATION_NOT_READY", message: "not ready" } }, 503),
    });
    await expect(client.scan(input)).rejects.toMatchObject({ code: "ISOLATION_NOT_READY", statusCode: 503 });

    const malformed = createScannerClient({
      baseUrl: "http://127.0.0.1:3100",
      internalToken: "server-token",
      fetchImpl: async () => response({ nope: true }),
    });
    await expect(malformed.scan(input)).rejects.toMatchObject({ code: "SCANNER_INVALID_RESPONSE" });
  });

  it("maps missing configuration and timeouts", async () => {
    const missing = createScannerClient({ baseUrl: "http://127.0.0.1:3100", internalToken: undefined });
    await expect(missing.scan(input)).rejects.toMatchObject({ code: "SCANNER_NOT_CONFIGURED" });

    const timeout = createScannerClient({
      baseUrl: "http://127.0.0.1:3100",
      internalToken: "server-token",
      timeoutMs: 5,
      fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    });
    await expect(timeout.scan(input)).rejects.toMatchObject({ code: "SCANNER_TIMEOUT" });
  });

  it("rejects invalid client inputs without making a request", async () => {
    let called = false;
    const client = createScannerClient({
      baseUrl: "http://127.0.0.1:3100",
      internalToken: "server-token",
      fetchImpl: async () => {
        called = true;
        return response(scanResult);
      },
    });
    await expect(client.scan({ scanId: "not-a-uuid", url: "bad" })).rejects.toBeInstanceOf(ScannerClientError);
    expect(called).toBe(false);
  });
});
