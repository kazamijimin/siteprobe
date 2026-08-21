import { describe, expect, it, vi } from "vitest";
import type { ControlledQaEvaluationCreate } from "@siteprobe/contracts";
import { createApiClient } from "./api-client.js";
import { ControlledEvaluationError } from "./errors.js";

const config = {
  apiUrl: new URL("http://127.0.0.1:3000"),
  internalToken: "test-only-ingestion-token",
};

const payload = {
  schemaVersion: 1,
  evaluatorVersion: 1,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  provenance: "controlled-fixture" as const,
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  scannedAt: "2026-08-21T00:00:00.000Z",
  evaluation: {
    findings: [
      { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "passed", severity: "info", title: "Navigation completed", description: "ok", evidence: { kind: "navigation", navigationSucceeded: true, failureCode: null, requestedUrl: "http://fixture.invalid/", finalUrl: "http://fixture.invalid/", navigationDurationMs: 1 } },
      { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "passed", severity: "info", title: "HTTP status acceptable", description: "ok", evidence: { kind: "httpStatus", value: 200 } },
      { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "passed", severity: "info", title: "Document title present", description: "ok", evidence: { kind: "title", present: true, characterCount: 1 } },
      { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No console errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No page errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "passed", severity: "info", title: "No failed requests", description: "ok", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
    ],
    summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 },
  },
} satisfies ControlledQaEvaluationCreate;

const response = {
  id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  source: "controlled-scanner",
  ...payload,
  createdAt: "2026-08-21T00:01:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("controlled evaluation API client", () => {
  it("checks health without credentials and ingests with redirect refusal", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(jsonResponse(response, 201));
    const client = createApiClient(config, fetchImpl);

    await client.healthCheck();
    await expect(client.ingest(payload)).resolves.toMatchObject({ id: response.id });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, new URL("http://127.0.0.1:3000/health"), expect.objectContaining({ method: "GET", redirect: "error" }));
    expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty("headers.authorization");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, new URL("http://127.0.0.1:3000/internal/qa-evaluations"), expect.objectContaining({
      method: "POST",
      redirect: "error",
      headers: expect.objectContaining({ authorization: "Bearer test-only-ingestion-token" }),
    }));
  });

  it.each([
    [401, "INGESTION_AUTH_FAILURE"],
    [400, "INGESTION_VALIDATION_FAILURE"],
    [409, "INGESTION_CONFLICT"],
  ] as const)("maps HTTP %s safely", async (status, stage) => {
    const client = createApiClient(config, vi.fn().mockResolvedValue(jsonResponse({ error: { code: "SAFE", message: "safe error", requestId: "req-1" } }, status)));
    await expect(client.ingest(payload)).rejects.toMatchObject({ stage, statusCode: status });
  });

  it("rejects an invalid successful response without exposing response content", async () => {
    const client = createApiClient(config, vi.fn().mockResolvedValue(jsonResponse({ secret: "must-not-leak" }, 201)));
    const error = await client.ingest(payload).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ControlledEvaluationError);
    expect((error as ControlledEvaluationError).stage).toBe("INGESTION_INVALID_RESPONSE");
    expect((error as ControlledEvaluationError).message).not.toContain("must-not-leak");
  });

  it("fails safely when the fetch implementation reports a redirect", async () => {
    const client = createApiClient(config, vi.fn().mockRejectedValue(new TypeError("redirect blocked")));
    await expect(client.ingest(payload)).rejects.toMatchObject({ stage: "INGESTION_UNAVAILABLE" });
  });
});
