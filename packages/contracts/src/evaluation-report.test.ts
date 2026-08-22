import { describe, expect, it } from "vitest";
import { evaluationReportPublicResponseSchema } from "./evaluation-report.js";

const id = "00000000-0000-4000-8000-000000000000";
const report = {
  schemaVersion: 1,
  anchorEvaluationId: id,
  provenance: "controlled-fixture" as const,
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  scannedAt: "2026-08-22T00:00:00.000Z",
  qa: { available: true as const, evaluationId: id, summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 } },
  accessibility: { available: false as const, reason: "not-produced" as const },
  seo: { available: false as const, reason: "public-access-disabled" as const },
  attentionItems: [{ source: "qa" as const, severity: "warning" as const, ruleId: "DOCUMENT_TITLE_PRESENT", title: "Document title present", description: "The document does not contain a non-empty title." }],
};

describe("evaluation report contract", () => {
  it("accepts complete and partial gated reports", () => {
    expect(evaluationReportPublicResponseSchema.parse(report)).toEqual(report);
    expect(evaluationReportPublicResponseSchema.parse({ ...report, qa: { available: false, reason: "not-produced" }, accessibility: { available: true, evaluationId: id, summary: { violationRules: 0, violationNodes: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 0, needsReviewNodes: 0 } } })).toMatchObject({ qa: { available: false }, accessibility: { available: true } });
  });

  it("rejects internal fields and invalid provenance", () => {
    expect(() => evaluationReportPublicResponseSchema.parse({ ...report, scannerRunId: id })).toThrow();
    expect(() => evaluationReportPublicResponseSchema.parse({ ...report, provenance: "https://example.com" })).toThrow();
  });
});
