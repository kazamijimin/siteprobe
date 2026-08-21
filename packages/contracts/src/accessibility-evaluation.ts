import { z } from "zod";
import { controlledEvaluationProvenanceSchema } from "./provenance.js";

export const ACCESSIBILITY_SCHEMA_VERSION = 1 as const;
export const ACCESSIBILITY_EVALUATOR_VERSION = 1 as const;
export const AXE_ENGINE_VERSION = "4.13.0" as const;
export const AXE_ADAPTER_VERSION = "4.13.0" as const;
export const ACCESSIBILITY_MAX_SERIALIZED_BYTES = 48 * 1024;

export const accessibilitySchemaVersionSchema = z.literal(ACCESSIBILITY_SCHEMA_VERSION);
export const accessibilityEvaluatorVersionSchema = z.literal(ACCESSIBILITY_EVALUATOR_VERSION);
export const axeEngineVersionSchema = z.string().min(1).max(32);
export const axeAdapterVersionSchema = z.string().min(1).max(32);

export const accessibilityRulesetTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

export const accessibilityRulesetTagsSchema = z.tuple([
  z.literal("wcag2a"),
  z.literal("wcag2aa"),
  z.literal("wcag21a"),
  z.literal("wcag21aa"),
  z.literal("wcag22aa"),
]);

export const accessibilityImpactSchema = z.enum(["minor", "moderate", "serious", "critical"]).nullable();
export const accessibilityStatusSchema = z.enum(["completed", "notApplicable"]);
export const accessibilityFailureCodeSchema = z.enum(["AXE_EXECUTION_FAILED", "AXE_RESULT_INVALID"]);
export const accessibilityNotApplicableReasonSchema = z.literal("navigationFailed");

const boundedRuleId = z.string().regex(/^[a-z0-9-]+$/).max(64);
const boundedHelp = z.string().max(256);
const boundedFailureSummary = z.string().max(512).nullable();
const boundedTargetSegment = z.string().max(128);

export const accessibilitySampleSchema = z.object({
  target: z.array(boundedTargetSegment).max(4),
  failureSummary: boundedFailureSummary,
}).strict().superRefine((sample, ctx) => {
  if (sample.target.join(" >>> ").length > 512) {
    ctx.addIssue({ code: "custom", path: ["target"], message: "Combined selector exceeds 512 characters" });
  }
});

export const accessibilityRuleResultSchema = z.object({
  ruleId: boundedRuleId,
  impact: accessibilityImpactSchema,
  help: boundedHelp,
  affectedNodeCount: z.number().int().nonnegative().max(1_000_000),
  affectedNodeCountCapped: z.boolean(),
  samples: z.array(accessibilitySampleSchema).max(3),
  samplesTruncated: z.boolean(),
}).strict();

export const accessibilitySummarySchema = z.object({
  violationRules: z.number().int().nonnegative().max(1_000_000),
  violationNodes: z.number().int().nonnegative().max(1_000_000),
  critical: z.number().int().nonnegative().max(1_000_000),
  serious: z.number().int().nonnegative().max(1_000_000),
  moderate: z.number().int().nonnegative().max(1_000_000),
  minor: z.number().int().nonnegative().max(1_000_000),
  unknownImpact: z.number().int().nonnegative().max(1_000_000),
  needsReviewRules: z.number().int().nonnegative().max(1_000_000),
  needsReviewNodes: z.number().int().nonnegative().max(1_000_000),
}).strict();

export const accessibilityCompletedEvaluationSchema = z.object({
  status: z.literal("completed"),
  summary: accessibilitySummarySchema,
  violations: z.array(accessibilityRuleResultSchema).max(20),
  needsReview: z.array(accessibilityRuleResultSchema).max(10),
  violationsTruncated: z.boolean(),
  needsReviewTruncated: z.boolean(),
  countsCapped: z.boolean(),
  payloadTruncated: z.boolean(),
}).strict().superRefine((evaluation, ctx) => {
  const retainedViolations = evaluation.violations;
  const retainedNeedsReview = evaluation.needsReview;
  const violationCounts = {
    critical: retainedViolations.filter((item) => item.impact === "critical").length,
    serious: retainedViolations.filter((item) => item.impact === "serious").length,
    moderate: retainedViolations.filter((item) => item.impact === "moderate").length,
    minor: retainedViolations.filter((item) => item.impact === "minor").length,
    unknownImpact: retainedViolations.filter((item) => item.impact === null).length,
  };
  const retainedViolationNodes = retainedViolations.reduce((sum, item) => sum + item.affectedNodeCount, 0);
  const retainedNeedsReviewNodes = retainedNeedsReview.reduce((sum, item) => sum + item.affectedNodeCount, 0);
  if (evaluation.summary.violationRules < retainedViolations.length) {
    ctx.addIssue({ code: "custom", path: ["summary", "violationRules"], message: "Summary cannot be smaller than retained violations" });
  }
  if (evaluation.summary.violationNodes < retainedViolationNodes) {
    ctx.addIssue({ code: "custom", path: ["summary", "violationNodes"], message: "Summary cannot be smaller than retained violation nodes" });
  }
  if (evaluation.summary.needsReviewRules < retainedNeedsReview.length) {
    ctx.addIssue({ code: "custom", path: ["summary", "needsReviewRules"], message: "Summary cannot be smaller than retained needs-review rules" });
  }
  if (evaluation.summary.needsReviewNodes < retainedNeedsReviewNodes) {
    ctx.addIssue({ code: "custom", path: ["summary", "needsReviewNodes"], message: "Summary cannot be smaller than retained needs-review nodes" });
  }
  for (const key of ["critical", "serious", "moderate", "minor", "unknownImpact"] as const) {
    if (evaluation.summary[key] < violationCounts[key]) {
      ctx.addIssue({ code: "custom", path: ["summary", key], message: "Summary cannot be smaller than retained impact counts" });
    }
  }
  if (!evaluation.violationsTruncated && evaluation.summary.violationRules !== retainedViolations.length) {
    ctx.addIssue({ code: "custom", path: ["summary", "violationRules"], message: "Summary must match violations when not truncated" });
  }
  if (!evaluation.needsReviewTruncated && evaluation.summary.needsReviewRules !== retainedNeedsReview.length) {
    ctx.addIssue({ code: "custom", path: ["summary", "needsReviewRules"], message: "Summary must match needs-review rules when not truncated" });
  }
  if (!evaluation.countsCapped && evaluation.summary.violationNodes !== retainedViolationNodes) {
    ctx.addIssue({ code: "custom", path: ["summary", "violationNodes"], message: "Summary must match violation nodes when counts are not capped" });
  }
  if (!evaluation.countsCapped && evaluation.summary.needsReviewNodes !== retainedNeedsReviewNodes) {
    ctx.addIssue({ code: "custom", path: ["summary", "needsReviewNodes"], message: "Summary must match needs-review nodes when counts are not capped" });
  }
  if (!evaluation.violationsTruncated && !evaluation.countsCapped) {
    for (const key of ["critical", "serious", "moderate", "minor", "unknownImpact"] as const) {
      if (evaluation.summary[key] !== violationCounts[key]) {
        ctx.addIssue({ code: "custom", path: ["summary", key], message: "Summary must match impact counts when not truncated" });
      }
    }
  }
});

export const accessibilityNotApplicableEvaluationSchema = z.object({
  status: z.literal("notApplicable"),
  reason: accessibilityNotApplicableReasonSchema,
  summary: accessibilitySummarySchema,
  violations: z.array(accessibilityRuleResultSchema).length(0),
  needsReview: z.array(accessibilityRuleResultSchema).length(0),
  violationsTruncated: z.literal(false),
  needsReviewTruncated: z.literal(false),
  countsCapped: z.literal(false),
  payloadTruncated: z.literal(false),
}).strict().superRefine((evaluation, ctx) => {
  const zeroSummary = Object.values(evaluation.summary).every((value) => value === 0);
  if (!zeroSummary) ctx.addIssue({ code: "custom", path: ["summary"], message: "Not-applicable results must have zero counts" });
});

export const accessibilityEvaluationSchema = z.discriminatedUnion("status", [
  accessibilityCompletedEvaluationSchema,
  accessibilityNotApplicableEvaluationSchema,
]);

export const accessibilityEngineMetadataSchema = z.object({
  engine: z.literal("axe-core"),
  engineVersion: z.literal(AXE_ENGINE_VERSION),
  adapter: z.literal("@axe-core/playwright"),
  adapterVersion: z.literal(AXE_ADAPTER_VERSION),
  rulesetTags: accessibilityRulesetTagsSchema,
}).strict();

const metadataBase = {
  schemaVersion: accessibilitySchemaVersionSchema,
  evaluatorVersion: accessibilityEvaluatorVersionSchema,
  scannerRunId: z.string().uuid(),
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  engine: z.literal("axe-core"),
  engineVersion: z.literal(AXE_ENGINE_VERSION),
  adapter: z.literal("@axe-core/playwright"),
  adapterVersion: z.literal(AXE_ADAPTER_VERSION),
  rulesetTags: accessibilityRulesetTagsSchema,
  evaluation: accessibilityEvaluationSchema,
};

function assertMetadataConsistency(input: { requestedUrl: string; finalUrl: string | null; evaluation: z.infer<typeof accessibilityEvaluationSchema> }, ctx: z.RefinementCtx): void {
  if (input.evaluation.status === "notApplicable") return;
  if (input.requestedUrl.length === 0) ctx.addIssue({ code: "custom", path: ["requestedUrl"], message: "requestedUrl is required" });
  if (input.finalUrl !== null && input.finalUrl.length === 0) ctx.addIssue({ code: "custom", path: ["finalUrl"], message: "finalUrl must be null or non-empty" });
}

export const accessibilityEvaluationCreateSchema = z.object({
  provenance: controlledEvaluationProvenanceSchema.optional(),
  ...metadataBase,
}).strict().superRefine(assertMetadataConsistency);

export const accessibilityEvaluationResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  provenance: controlledEvaluationProvenanceSchema,
  ...metadataBase,
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine(assertMetadataConsistency);

export const accessibilityEvaluationIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

const publicAccessibilityEvaluationSchema = accessibilityEvaluationSchema.superRefine((evaluation, ctx) => {
  if (evaluation.status !== "completed") return;
  evaluation.violations.forEach((rule, ruleIndex) => {
    if (/<[a-z!/][^>]*>/i.test(rule.help)) ctx.addIssue({ code: "custom", path: ["violations", ruleIndex, "help"], message: "Raw HTML is not allowed" });
    rule.samples.forEach((sample, sampleIndex) => {
      if (sample.failureSummary && /<[a-z!/][^>]*>/i.test(sample.failureSummary)) ctx.addIssue({ code: "custom", path: ["violations", ruleIndex, "samples", sampleIndex, "failureSummary"], message: "Raw HTML is not allowed" });
    });
  });
  evaluation.needsReview.forEach((rule, ruleIndex) => {
    if (/<[a-z!/][^>]*>/i.test(rule.help)) ctx.addIssue({ code: "custom", path: ["needsReview", ruleIndex, "help"], message: "Raw HTML is not allowed" });
    rule.samples.forEach((sample, sampleIndex) => {
      if (sample.failureSummary && /<[a-z!/][^>]*>/i.test(sample.failureSummary)) ctx.addIssue({ code: "custom", path: ["needsReview", ruleIndex, "samples", sampleIndex, "failureSummary"], message: "Raw HTML is not allowed" });
    });
  });
});

/**
 * Read-only projection for the development accessibility detail screen.
 * Internal scanner-run identifiers and raw axe metadata are intentionally not
 * part of this contract; the engine information is grouped as presentation
 * metadata while the normalized evaluation remains unchanged.
 */
export const accessibilityEvaluationPublicResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  provenance: controlledEvaluationProvenanceSchema,
  schemaVersion: accessibilitySchemaVersionSchema,
  evaluatorVersion: accessibilityEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  engine: accessibilityEngineMetadataSchema,
  evaluation: publicAccessibilityEvaluationSchema,
  relatedQaEvaluationId: z.string().uuid().nullable(),
}).strict().superRefine(assertMetadataConsistency);

const accessibilityEvaluationListEngineSchema = z.object({
  engine: z.literal("axe-core"),
  engineVersion: z.literal(AXE_ENGINE_VERSION),
}).strict();

const accessibilityEvaluationListBase = {
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  provenance: controlledEvaluationProvenanceSchema,
  evaluatorVersion: accessibilityEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  scannedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  engine: accessibilityEvaluationListEngineSchema,
};

export const accessibilityEvaluationListItemSchema = z.discriminatedUnion("status", [
  z.object({
    ...accessibilityEvaluationListBase,
    status: z.literal("completed"),
    summary: accessibilitySummarySchema,
  }).strict(),
  z.object({
    ...accessibilityEvaluationListBase,
    status: z.literal("notApplicable"),
    reason: accessibilityNotApplicableReasonSchema,
  }).strict(),
]);

export const accessibilityEvaluationListCursorPayloadSchema = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

export const accessibilityEvaluationListCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor must be a base64url value");

export const listAccessibilityEvaluationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: accessibilityEvaluationListCursorSchema.optional(),
}).strict();

export const listAccessibilityEvaluationsResponseSchema = z.object({
  evaluations: z.array(accessibilityEvaluationListItemSchema).max(50),
  nextCursor: accessibilityEvaluationListCursorSchema.nullable(),
}).strict();

export type AccessibilityImpact = z.infer<typeof accessibilityImpactSchema>;
export type AccessibilitySample = z.infer<typeof accessibilitySampleSchema>;
export type AccessibilityRuleResult = z.infer<typeof accessibilityRuleResultSchema>;
export type AccessibilitySummary = z.infer<typeof accessibilitySummarySchema>;
export type AccessibilityCompletedEvaluation = z.infer<typeof accessibilityCompletedEvaluationSchema>;
export type AccessibilityNotApplicableEvaluation = z.infer<typeof accessibilityNotApplicableEvaluationSchema>;
export type AccessibilityEvaluation = z.infer<typeof accessibilityEvaluationSchema>;
export type AccessibilityEngineMetadata = z.infer<typeof accessibilityEngineMetadataSchema>;
export type AccessibilityEvaluationCreate = z.infer<typeof accessibilityEvaluationCreateSchema>;
export type AccessibilityEvaluationResponse = z.infer<typeof accessibilityEvaluationResponseSchema>;
export type AccessibilityEvaluationPublicResponse = z.infer<typeof accessibilityEvaluationPublicResponseSchema>;
export type AccessibilityEvaluationIdParams = z.infer<typeof accessibilityEvaluationIdParamsSchema>;
export type AccessibilityEvaluationListItem = z.infer<typeof accessibilityEvaluationListItemSchema>;
export type AccessibilityEvaluationListCursorPayload = z.infer<typeof accessibilityEvaluationListCursorPayloadSchema>;
export type ListAccessibilityEvaluationsQuery = z.infer<typeof listAccessibilityEvaluationsQuerySchema>;
export type ListAccessibilityEvaluationsResponse = z.infer<typeof listAccessibilityEvaluationsResponseSchema>;
export type AccessibilityFailureCode = z.infer<typeof accessibilityFailureCodeSchema>;
