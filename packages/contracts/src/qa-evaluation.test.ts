import { describe, expect, it } from "vitest";
import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationResponseSchema,
  qaEvaluationIdParamsSchema,
  qaEvaluationSchema,
} from "./qa-evaluation.js";

const navigation = {
  kind: "navigation" as const,
  navigationSucceeded: true,
  failureCode: null,
  requestedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  navigationDurationMs: 42,
};

function evaluation() {
  const findings = [
    ["NAVIGATION_COMPLETED", "navigation", "passed", "info", navigation],
    ["HTTP_STATUS_ACCEPTABLE", "navigation", "passed", "info", { kind: "httpStatus", value: 200 }],
    ["DOCUMENT_TITLE_PRESENT", "document", "passed", "info", { kind: "title", present: true, characterCount: 7 }],
    ["NO_CONSOLE_ERRORS", "runtime", "passed", "info", { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false }],
    ["NO_PAGE_ERRORS", "runtime", "passed", "info", { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false }],
    ["NO_FAILED_REQUESTS", "network", "passed", "info", { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false }],
  ].map(([ruleId, category, status, severity, evidence]) => ({
    ruleId, category, status, severity,
    title: String(ruleId), description: "ok", evidence,
  }));
  return { findings, summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 } };
}

const create = {
  schemaVersion: 1,
  evaluatorVersion: 1,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  requestedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  scannedAt: "2026-08-20T00:00:00.000Z",
  evaluation: evaluation(),
};

describe("controlled QA evaluation contracts", () => {
  it("accepts the canonical six-finding evaluation and create payload", () => {
    expect(qaEvaluationSchema.parse(create.evaluation).findings).toHaveLength(6);
    expect(controlledQaEvaluationCreateSchema.parse(create).scannerRunId).toBe(create.scannerRunId);
  });

  it("rejects wrong order, pairing, summary, status severity, unknown fields, and metadata", () => {
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: [...create.evaluation.findings].reverse() })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: create.evaluation.findings.slice(0, 5) })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, summary: { critical: 0, warnings: 0, passed: 5, notApplicable: 0 } })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: create.evaluation.findings.map((f, i) => i === 0 ? { ...f, severity: "warning" } : f) })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: create.evaluation.findings.map((f, i) => i === 0 ? { ...f, category: "document" } : f) })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: create.evaluation.findings.map((f, i) => i === 0 ? { ...f, evidence: { kind: "title", present: true, characterCount: 1 } } : f) })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, findings: create.evaluation.findings.map((f, i) => i === 3 ? { ...f, evidence: { kind: "messages", recordedCount: 4, samples: ["1", "2", "3", "4"], samplesTruncated: true } } : f) })).toThrow();
    expect(() => qaEvaluationSchema.parse({ ...create.evaluation, extra: true })).toThrow();
    expect(() => controlledQaEvaluationCreateSchema.parse({ ...create, requestedUrl: "https://other.example/" })).toThrow();
  });

  it("rejects unsupported versions and malformed ids", () => {
    expect(() => controlledQaEvaluationCreateSchema.parse({ ...create, schemaVersion: 2 })).toThrow();
    expect(() => qaEvaluationIdParamsSchema.parse({ id: "not-a-uuid" })).toThrow();
  });

  it("validates a response envelope without score fields", () => {
    const response = { id: create.scannerRunId, source: "controlled-scanner", ...create, createdAt: create.scannedAt };
    expect(controlledQaEvaluationResponseSchema.parse(response)).not.toHaveProperty("score");
  });
});
