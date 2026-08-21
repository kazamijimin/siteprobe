import { describe, expect, it } from "vitest";
import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationListItemSchema,
  controlledQaEvaluationPublicResponseSchema,
  controlledQaEvaluationResponseSchema,
  listControlledQaEvaluationsQuerySchema,
  listControlledQaEvaluationsResponseSchema,
  qaEvaluationListCursorPayloadSchema,
  qaEvaluationListCursorSchema,
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

  it("validates the strict public projection without internal scanner metadata", () => {
    const response = {
      id: create.scannerRunId,
      source: "controlled-scanner",
      schemaVersion: create.schemaVersion,
      evaluatorVersion: create.evaluatorVersion,
      requestedUrl: create.requestedUrl,
      finalUrl: create.finalUrl,
      scannedAt: create.scannedAt,
      evaluation: create.evaluation,
      createdAt: create.scannedAt,
    };

    expect(controlledQaEvaluationPublicResponseSchema.parse(response)).toEqual(response);
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({ ...response, scannerRunId: create.scannerRunId })).toThrow();
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({ ...response, score: 87 })).toThrow();
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({ ...response, evaluation: { ...response.evaluation, findings: [...response.evaluation.findings].reverse() } })).toThrow();
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({ ...response, schemaVersion: 2 })).toThrow();
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({ ...response, evaluation: { ...response.evaluation, summary: { critical: 0, warnings: 0, passed: 5, notApplicable: 0 } } })).toThrow();
    expect(controlledQaEvaluationPublicResponseSchema.parse({
      ...response,
      evaluation: {
        ...response.evaluation,
        findings: response.evaluation.findings.map((finding, index) => index === 3
          ? { ...finding, evidence: { kind: 'messages', recordedCount: 3, samples: ['one', 'two', 'three'], samplesTruncated: true } }
          : finding),
      },
    }).evaluation.findings[3].evidence).toMatchObject({ recordedCount: 3, samplesTruncated: true });
    expect(() => controlledQaEvaluationPublicResponseSchema.parse({
      ...response,
      evaluation: {
        ...response.evaluation,
        findings: response.evaluation.findings.map((finding, index) => index === 3
          ? { ...finding, evidence: { kind: 'messages', recordedCount: 4, samples: ['one', 'two', 'three', 'four'], samplesTruncated: true } }
          : finding),
      },
    })).toThrow();
  });

  it("validates the reduced strict list projection and rejects detail-only fields", () => {
    const item = {
      id: create.scannerRunId,
      source: "controlled-scanner",
      evaluatorVersion: 1,
      requestedUrl: create.requestedUrl,
      scannedAt: create.scannedAt,
      createdAt: create.scannedAt,
      summary: create.evaluation.summary,
    };
    expect(controlledQaEvaluationListItemSchema.parse(item)).toEqual(item);
    for (const field of ["scannerRunId", "finalUrl", "score", "findings", "evaluation", "evidence"]) {
      expect(() => controlledQaEvaluationListItemSchema.parse({ ...item, [field]: field === "findings" ? [] : field === "evidence" ? {} : null })).toThrow();
    }
    expect(() => controlledQaEvaluationListItemSchema.parse({ ...item, extra: true })).toThrow();
  });

  it("validates list responses, bounded limits, and QA-specific opaque cursors", () => {
    const payload = { v: 1 as const, createdAt: create.scannedAt, id: create.scannerRunId };
    const cursor = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(qaEvaluationListCursorPayloadSchema.parse(payload)).toEqual(payload);
    expect(qaEvaluationListCursorSchema.parse(cursor)).toBe(cursor);
    expect(listControlledQaEvaluationsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listControlledQaEvaluationsQuerySchema.parse({ limit: "1", cursor })).toEqual({ limit: 1, cursor });
    expect(listControlledQaEvaluationsQuerySchema.parse({ limit: 50 })).toEqual({ limit: 50 });
    expect(listControlledQaEvaluationsResponseSchema.parse({ evaluations: [], nextCursor: null })).toEqual({ evaluations: [], nextCursor: null });
    expect(listControlledQaEvaluationsResponseSchema.parse({ evaluations: [], nextCursor: cursor })).toEqual({ evaluations: [], nextCursor: cursor });
    for (const limit of [0, 51]) expect(() => listControlledQaEvaluationsQuerySchema.parse({ limit })).toThrow();
    expect(() => listControlledQaEvaluationsQuerySchema.parse({ limit: 20, q: "example" })).toThrow();
    expect(() => qaEvaluationListCursorSchema.parse("not-valid!!")).toThrow();
    expect(() => qaEvaluationListCursorPayloadSchema.parse({ ...payload, v: 2 })).toThrow();
    expect(() => qaEvaluationListCursorPayloadSchema.parse({ v: 1, createdAt: "bad", id: "bad" })).toThrow();
    expect(() => listControlledQaEvaluationsResponseSchema.parse({ evaluations: [], nextCursor: null, extra: true })).toThrow();
  });
});
