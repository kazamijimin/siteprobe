import { describe, expect, it, vi } from "vitest";
import { scannerResultSchema, type QaEvaluation, type ScannerResult } from "@siteprobe/contracts";
import { evaluateScannerResult } from "@siteprobe/scanner";
import { runControlledEvaluationWorkflow } from "./workflow.js";
import { ControlledEvaluationError } from "./errors.js";

const config = { apiUrl: new URL("http://127.0.0.1:3000"), internalToken: "tool-only-token" };

function result(overrides: Record<string, unknown> = {}): ScannerResult {
  return scannerResultSchema.parse({
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
    scannedAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  });
}

const evaluation: QaEvaluation = {
  findings: [
    { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "passed", severity: "info", title: "Navigation completed", description: "ok", evidence: { kind: "navigation", navigationSucceeded: true, failureCode: null, requestedUrl: "http://fixture.invalid/", finalUrl: "http://fixture.invalid/", navigationDurationMs: 1 } },
    { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "passed", severity: "info", title: "HTTP status acceptable", description: "ok", evidence: { kind: "httpStatus", value: 200 } },
    { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "passed", severity: "info", title: "Document title present", description: "ok", evidence: { kind: "title", present: true, characterCount: 1 } },
    { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No console errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
    { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No page errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
    { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "passed", severity: "info", title: "No failed requests", description: "ok", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
  ],
  summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 },
};

const persisted = {
  id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  source: "controlled-scanner" as const,
  schemaVersion: 1 as const,
  evaluatorVersion: 1 as const,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  scannedAt: "2026-08-21T00:00:00.000Z",
  evaluation,
  createdAt: "2026-08-21T00:01:00.000Z",
};

function api() {
  return {
    healthCheck: vi.fn().mockResolvedValue(undefined),
    ingest: vi.fn().mockResolvedValue(persisted),
  };
}

describe("controlled evaluation workflow", () => {
  it("runs health, fixture, evaluator, and authenticated ingestion in order", async () => {
    const calls: string[] = [];
    const healthCheck = vi.fn().mockImplementation(async () => { calls.push("health"); });
    const scanned = result();
    const runFixture = vi.fn().mockImplementation(async (id: string) => { calls.push(`fixture:${id}`); return scanned; });
    const evaluate = vi.fn().mockImplementation((value: ScannerResult) => { calls.push(`evaluate:${value.scanId}`); return evaluation; });
    const ingest = vi.fn().mockImplementation(async (payload: unknown) => { calls.push("ingest"); return persisted; });

    const workflow = await runControlledEvaluationWorkflow(config, "healthy", { api: { healthCheck, ingest }, runFixture, evaluate });
    expect(workflow.persistedEvaluation.id).toBe(persisted.id);
    expect(calls).toEqual(["health", "fixture:healthy", `evaluate:${scanned.scanId}`, "ingest"]);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ scannerRunId: persisted.scannerRunId, schemaVersion: 1, evaluatorVersion: 1 }));
  });

  it("accepts a valid failed ScannerResult and preserves its run ID", async () => {
    const failed = result({ navigationSucceeded: false, finalUrl: null, httpStatus: null, pageTitle: null, failureCode: "NAVIGATION_TIMEOUT" });
    const runFixture = vi.fn().mockResolvedValue(failed);
    const failedEvaluation = evaluateScannerResult(failed);
    const ingest = vi.fn().mockResolvedValue({ ...persisted, scannerRunId: failed.scanId, requestedUrl: failed.requestedUrl, finalUrl: null, evaluation: failedEvaluation });
    const evaluate = vi.fn().mockReturnValue(failedEvaluation);

    await runControlledEvaluationWorkflow(config, "navigation-timeout", { api: { healthCheck: vi.fn(), ingest }, runFixture, evaluate });
    expect(evaluate).toHaveBeenCalledWith(failed);
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ scannerRunId: failed.scanId, finalUrl: null }));
  });

  it("rejects invalid fixture input before health, scanner, or ingestion", async () => {
    const dependencies = { api: api(), runFixture: vi.fn(), evaluate: vi.fn() };
    await expect(runControlledEvaluationWorkflow(config, "https://example.com", dependencies)).rejects.toMatchObject({ stage: "INVALID_FIXTURE" });
    expect(dependencies.api.healthCheck).not.toHaveBeenCalled();
    expect(dependencies.runFixture).not.toHaveBeenCalled();
    expect(dependencies.api.ingest).not.toHaveBeenCalled();
  });

  it("does not ingest when the scanner result is invalid", async () => {
    const dependencies = { api: api(), runFixture: vi.fn().mockResolvedValue({ invalid: true }), evaluate: vi.fn() };
    const error = await runControlledEvaluationWorkflow(config, "healthy", dependencies).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ControlledEvaluationError);
    expect((error as ControlledEvaluationError).stage).toBe("SCANNER_INVALID_RESULT");
    expect(dependencies.evaluate).not.toHaveBeenCalled();
    expect(dependencies.api.ingest).not.toHaveBeenCalled();
  });
});
