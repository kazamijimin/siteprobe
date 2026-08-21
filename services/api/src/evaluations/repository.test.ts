import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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

  it("lists newest evaluations with stable cursor pagination and no duplicate IDs", async () => {
    const repo = new InMemoryQaEvaluationRepository();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
      const oldest = (await repo.create(input({ scannerRunId: randomUUID() }))).evaluation;
      vi.setSystemTime(new Date("2026-08-21T00:00:00.000Z"));
      const middle = (await repo.create(input({ scannerRunId: randomUUID() }))).evaluation;
      vi.setSystemTime(new Date("2026-08-22T00:00:00.000Z"));
      const newest = (await repo.create(input({ scannerRunId: randomUUID() }))).evaluation;

      const first = repo.list({ limit: 2 });
      expect(first.evaluations.map((item) => item.id)).toEqual([newest.id, middle.id]);
      expect(first.nextPosition).toEqual({ createdAt: middle.createdAt, id: middle.id });

      const second = repo.list({ limit: 2, before: first.nextPosition! });
      expect(second.evaluations.map((item) => item.id)).toEqual([oldest.id]);
      expect(second.nextPosition).toBeNull();
      expect(new Set([...first.evaluations, ...second.evaluations].map((item) => item.id)).size).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses descending UUID order for equal createdAt timestamps", async () => {
    const repo = new InMemoryQaEvaluationRepository();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-23T00:00:00.000Z"));
      const first = (await repo.create(input({ scannerRunId: randomUUID() }))).evaluation;
      const second = (await repo.create(input({ scannerRunId: randomUUID() }))).evaluation;
      const expected = [first, second].sort((left, right) => right.id.localeCompare(left.id));
      expect(repo.list({ limit: 2 }).evaluations.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an empty page without a cursor", () => {
    const repo = new InMemoryQaEvaluationRepository();
    expect(repo.list({ limit: 20 })).toEqual({ evaluations: [], nextPosition: null });
  });
});
