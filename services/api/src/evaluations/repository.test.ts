import { describe, expect, it } from "vitest";
import { InMemoryQaEvaluationRepository, QaEvaluationConflictError } from "./repository.js";
import type { ControlledQaEvaluationCreate } from "@siteprobe/contracts";

function input(overrides: Partial<ControlledQaEvaluationCreate> = {}): ControlledQaEvaluationCreate {
  return {
    schemaVersion: 1,
    evaluatorVersion: 1,
    scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    scannedAt: "2026-08-20T00:00:00.000Z",
    evaluation: {
      findings: [
        { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "passed", severity: "info", title: "Navigation completed", description: "ok", evidence: { kind: "navigation", navigationSucceeded: true, failureCode: null, requestedUrl: "https://example.com/", finalUrl: "https://example.com/", navigationDurationMs: 1 } },
        { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "passed", severity: "info", title: "HTTP status acceptable", description: "ok", evidence: { kind: "httpStatus", value: 200 } },
        { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "passed", severity: "info", title: "Document title present", description: "ok", evidence: { kind: "title", present: true, characterCount: 1 } },
        { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No console errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
        { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No page errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
        { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "passed", severity: "info", title: "No failed requests", description: "ok", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
      ],
      summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 },
    },
    ...overrides,
  };
}

describe("in-memory QA evaluation repository", () => {
  it("creates, reads, retries idempotently, and preserves input", async () => {
    const repo = new InMemoryQaEvaluationRepository();
    const original = input();
    const result = await repo.create(original);
    expect(result.created).toBe(true);
    expect(original.scannerRunId).toBe("5d41977d-ffb9-4388-af0a-0f74c8ee64ab");
    expect((await repo.findById(result.evaluation.id))?.id).toBe(result.evaluation.id);
    const retry = await repo.create(structuredClone(original));
    expect(retry).toEqual({ evaluation: result.evaluation, created: false });
  });

  it("rejects a different payload for the same run and evaluator", async () => {
    const repo = new InMemoryQaEvaluationRepository();
    await repo.create(input());
    expect(() => repo.create(input({ evaluation: {
      ...input().evaluation,
      findings: input().evaluation.findings.map((finding, index) => index === 1 ? { ...finding, description: "different" } : finding),
    } }))).toThrow(QaEvaluationConflictError);
  });

  it("supports null final URLs and separate evaluator versions at the database contract boundary", async () => {
    const repo = new InMemoryQaEvaluationRepository();
    const value = input({ finalUrl: null, evaluatorVersion: 1, evaluation: {
      ...input().evaluation,
      findings: input().evaluation.findings.map((finding, index) => index === 0 ? { ...finding, evidence: { ...finding.evidence, finalUrl: null } } : finding),
    } });
    const result = await repo.create(value);
    expect(result.evaluation.finalUrl).toBeNull();
    expect(await repo.findByScannerRun(value.scannerRunId, 2)).toBeUndefined();
  });
});
