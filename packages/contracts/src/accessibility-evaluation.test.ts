import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_EVALUATOR_VERSION,
  ACCESSIBILITY_SCHEMA_VERSION,
  AXE_ADAPTER_VERSION,
  AXE_ENGINE_VERSION,
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationListItemSchema,
  listAccessibilityEvaluationsQuerySchema,
  accessibilityEvaluationPublicResponseSchema,
  accessibilityEvaluationSchema,
  accessibilityFailureCodeSchema,
  accessibilityRulesetTags,
} from "./accessibility-evaluation.js";

const metadata = {
  schemaVersion: ACCESSIBILITY_SCHEMA_VERSION,
  evaluatorVersion: ACCESSIBILITY_EVALUATOR_VERSION,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  provenance: "controlled-fixture" as const,
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  scannedAt: "2026-08-21T00:00:00.000Z",
  engine: "axe-core" as const,
  engineVersion: AXE_ENGINE_VERSION,
  adapter: "@axe-core/playwright" as const,
  adapterVersion: AXE_ADAPTER_VERSION,
  rulesetTags: accessibilityRulesetTags,
};

const emptySummary = {
  violationRules: 0,
  violationNodes: 0,
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  unknownImpact: 0,
  needsReviewRules: 0,
  needsReviewNodes: 0,
};

describe("accessibility evaluation contracts", () => {
  it("accepts bounded completed and navigation-failure evaluations", () => {
    const completed = {
      status: "completed" as const,
      summary: { ...emptySummary, violationRules: 1, violationNodes: 1, critical: 1 },
      violations: [{
        ruleId: "image-alt",
        impact: "critical" as const,
        help: "Images must have alternate text",
        affectedNodeCount: 1,
        affectedNodeCountCapped: false,
        samples: [{ target: ["img"], failureSummary: "Fix any of the following" }],
        samplesTruncated: false,
      }],
      needsReview: [],
      violationsTruncated: false,
      needsReviewTruncated: false,
      countsCapped: false,
      payloadTruncated: false,
    };
    expect(accessibilityEvaluationSchema.parse(completed)).toEqual(completed);
    expect(accessibilityEvaluationCreateSchema.parse({ ...metadata, evaluation: completed })).toMatchObject(metadata);
    expect(accessibilityEvaluationSchema.parse({
      status: "notApplicable",
      reason: "navigationFailed",
      summary: emptySummary,
      violations: [],
      needsReview: [],
      violationsTruncated: false,
      needsReviewTruncated: false,
      countsCapped: false,
      payloadTruncated: false,
    })).toMatchObject({ status: "notApplicable", reason: "navigationFailed" });
  });

  it("rejects unsupported versions, metadata, unknown fields, and invalid impact", () => {
    const evaluation = {
      status: "completed",
      summary: emptySummary,
      violations: [],
      needsReview: [],
      violationsTruncated: false,
      needsReviewTruncated: false,
      countsCapped: false,
      payloadTruncated: false,
    };
    expect(() => accessibilityEvaluationCreateSchema.parse({ ...metadata, evaluation, schemaVersion: 2 })).toThrow();
    expect(() => accessibilityEvaluationCreateSchema.parse({ ...metadata, evaluation, engineVersion: "4.12.1" })).toThrow();
    expect(() => accessibilityEvaluationCreateSchema.parse({ ...metadata, evaluation, extra: true })).toThrow();
    expect(() => accessibilityEvaluationSchema.parse({ ...evaluation, violations: [{
      ruleId: "image-alt",
      impact: "info",
      help: "bad",
      affectedNodeCount: 1,
      affectedNodeCountCapped: false,
      samples: [],
      samplesTruncated: false,
    }], summary: { ...emptySummary, violationRules: 1, violationNodes: 1 } })).toThrow();
    expect(accessibilityFailureCodeSchema.parse("AXE_EXECUTION_FAILED")).toBe("AXE_EXECUTION_FAILED");
  });

  it("enforces selector, array, count, and summary bounds", () => {
    const base = {
      status: "completed" as const,
      summary: { ...emptySummary, violationRules: 1, violationNodes: 1, critical: 1 },
      violations: [{
        ruleId: "image-alt",
        impact: "critical" as const,
        help: "help",
        affectedNodeCount: 1,
        affectedNodeCountCapped: false,
        samples: [{ target: ["a".repeat(128), "b".repeat(128), "c".repeat(128)], failureSummary: null }],
        samplesTruncated: false,
      }],
      needsReview: [],
      violationsTruncated: false,
      needsReviewTruncated: false,
      countsCapped: false,
      payloadTruncated: false,
    };
    expect(accessibilityEvaluationSchema.parse(base)).toBeTruthy();
    expect(() => accessibilityEvaluationSchema.parse({ ...base, summary: { ...base.summary, critical: 0 } })).toThrow();
    expect(() => accessibilityEvaluationSchema.parse({ ...base, violations: [{ ...base.violations[0], samples: [{ target: ["a".repeat(128), "b".repeat(128), "c".repeat(128), "d".repeat(128)], failureSummary: "x".repeat(513) }] }] })).toThrow();
    expect(() => accessibilityEvaluationSchema.parse({ ...base, violations: [{ ...base.violations[0], affectedNodeCount: 1_000_001 }] })).toThrow();
  });

  it("accepts the strict public projection and rejects internal/raw fields", () => {
    const response = accessibilityEvaluationPublicResponseSchema.parse({
      id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab",
      source: "controlled-scanner",
      provenance: "controlled-fixture",
      schemaVersion: 1,
      evaluatorVersion: 1,
      requestedUrl: "http://fixture.invalid/accessibility-clean",
      finalUrl: "http://fixture.invalid/accessibility-clean",
      scannedAt: "2026-08-21T00:00:00.000Z",
      createdAt: "2026-08-21T00:01:00.000Z",
      relatedQaEvaluationId: null,
      engine: {
        engine: "axe-core",
        engineVersion: "4.13.0",
        adapter: "@axe-core/playwright",
        adapterVersion: "4.13.0",
        rulesetTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      evaluation: { status: "completed", summary: emptySummary, violations: [], needsReview: [], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false },
    });
    expect(response.relatedQaEvaluationId).toBeNull();
    expect(accessibilityEvaluationPublicResponseSchema.parse({ ...response, relatedQaEvaluationId: response.id }).relatedQaEvaluationId).toBe(response.id);
    expect(() => accessibilityEvaluationPublicResponseSchema.parse({ ...response, relatedQaEvaluationId: "not-a-uuid" })).toThrow();
    expect(response).not.toHaveProperty("scannerRunId");
    expect(() => accessibilityEvaluationPublicResponseSchema.parse({ ...response, scannerRunId: response.id })).toThrow();
    expect(() => accessibilityEvaluationPublicResponseSchema.parse({ ...response, raw: { html: "<img>" }, helpUrl: "https://example.invalid" })).toThrow();
    expect(() => accessibilityEvaluationPublicResponseSchema.parse({
      ...response,
      evaluation: {
        ...response.evaluation,
        summary: { ...response.evaluation.summary, violationRules: 1, violationNodes: 1, critical: 1 },
        violations: [{ ruleId: "image-alt", impact: "critical", help: "Images need text", affectedNodeCount: 1, affectedNodeCountCapped: false, samples: [{ target: ["img"], failureSummary: "<img>" }], samplesTruncated: false }],
      },
    })).toThrow();
  });

  it("accepts compact completed and navigation-failure list projections only", () => {
    const base = {
      id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab",
      source: "controlled-scanner" as const,
      provenance: "controlled-fixture" as const,
      evaluatorVersion: 1 as const,
      requestedUrl: "http://fixture.invalid/accessibility-clean",
      scannedAt: "2026-08-21T00:00:00.000Z",
      createdAt: "2026-08-21T00:01:00.000Z",
      engine: { engine: "axe-core" as const, engineVersion: "4.13.0" as const },
    };
    const completed = accessibilityEvaluationListItemSchema.parse({
      ...base,
      status: "completed",
      summary: emptySummary,
    });
    expect(completed).toMatchObject({ status: "completed", summary: emptySummary });
    expect(() => accessibilityEvaluationListItemSchema.parse({ ...completed, scannerRunId: base.id })).toThrow();
    const failed = accessibilityEvaluationListItemSchema.parse({
      ...base,
      status: "notApplicable",
      reason: "navigationFailed",
    });
    expect(failed).toMatchObject({ status: "notApplicable", reason: "navigationFailed" });
    expect(() => accessibilityEvaluationListItemSchema.parse({ ...failed, summary: emptySummary })).toThrow();
  });

  it("keeps list query limits bounded and rejects unknown fields", () => {
    expect(listAccessibilityEvaluationsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listAccessibilityEvaluationsQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
    expect(() => listAccessibilityEvaluationsQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => listAccessibilityEvaluationsQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() => listAccessibilityEvaluationsQuerySchema.parse({ search: "fixture" })).toThrow();
  });
});
