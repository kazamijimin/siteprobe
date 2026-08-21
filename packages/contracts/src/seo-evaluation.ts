import { z } from "zod";
import { controlledEvaluationProvenanceSchema } from "./provenance.js";

export const SEO_SCHEMA_VERSION = 1 as const;
export const SEO_EVALUATOR_VERSION = 1 as const;
export const SEO_MAX_SERIALIZED_BYTES = 32 * 1024;

export const seoSchemaVersionSchema = z.literal(SEO_SCHEMA_VERSION);
export const seoEvaluatorVersionSchema = z.literal(SEO_EVALUATOR_VERSION);
export const seoRuleIdSchema = z.enum([
  "SEO_TITLE_PRESENT",
  "SEO_TITLE_LENGTH",
  "SEO_META_DESCRIPTION_PRESENT",
  "SEO_META_DESCRIPTION_LENGTH",
  "SEO_CANONICAL_PRESENT",
  "SEO_HTML_LANG_PRESENT",
  "SEO_VIEWPORT_PRESENT",
  "SEO_SINGLE_H1",
  "SEO_IMAGES_HAVE_ALT",
]);
export const seoFindingStatusSchema = z.enum(["passed", "failed", "notApplicable"]);
export const seoSeveritySchema = z.enum(["info", "warning"]);
export const seoEvaluationStatusSchema = z.enum(["completed", "notApplicable"]);
export const seoNotApplicableReasonSchema = z.literal("navigationFailed");

const boundedText = (max: number) => z.string().max(max);
const boundedCount = z.number().int().nonnegative().max(1_000_000);

export const seoEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), present: z.boolean(), value: boundedText(256).nullable(), characterCount: z.number().int().nonnegative().max(256), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal("description"), present: z.boolean(), value: boundedText(512).nullable(), characterCount: z.number().int().nonnegative().max(512), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal("canonical"), present: z.boolean(), value: boundedText(1024).nullable(), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal("htmlLang"), present: z.boolean(), value: boundedText(64).nullable(), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal("viewport"), present: z.boolean(), value: boundedText(256).nullable(), truncated: z.boolean() }).strict(),
  z.object({ kind: z.literal("headings"), h1Count: boundedCount, headingCounts: z.object({ h1: boundedCount, h2: boundedCount, h3: boundedCount, h4: boundedCount, h5: boundedCount, h6: boundedCount }).strict() }).strict(),
  z.object({ kind: z.literal("images"), imageCount: boundedCount, missingAltCount: boundedCount, samples: z.array(boundedText(256)).max(3), samplesTruncated: z.boolean() }).strict(),
]).superRefine((evidence, ctx) => {
  if (evidence.kind === "images" && evidence.missingAltCount > evidence.imageCount) {
    ctx.addIssue({ code: "custom", path: ["missingAltCount"], message: "Missing alt count cannot exceed image count" });
  }
});

const expectedEvidence: Record<z.infer<typeof seoRuleIdSchema>, z.infer<typeof seoEvidenceSchema>["kind"]> = {
  SEO_TITLE_PRESENT: "title",
  SEO_TITLE_LENGTH: "title",
  SEO_META_DESCRIPTION_PRESENT: "description",
  SEO_META_DESCRIPTION_LENGTH: "description",
  SEO_CANONICAL_PRESENT: "canonical",
  SEO_HTML_LANG_PRESENT: "htmlLang",
  SEO_VIEWPORT_PRESENT: "viewport",
  SEO_SINGLE_H1: "headings",
  SEO_IMAGES_HAVE_ALT: "images",
};

export const seoFindingSchema = z.object({
  ruleId: seoRuleIdSchema,
  status: seoFindingStatusSchema,
  severity: seoSeveritySchema,
  description: boundedText(512),
  evidence: seoEvidenceSchema,
}).strict().superRefine((finding, ctx) => {
  if (expectedEvidence[finding.ruleId] !== finding.evidence.kind) {
    ctx.addIssue({ code: "custom", path: ["evidence", "kind"], message: "Evidence does not match rule" });
  }
  if (finding.status === "failed" && finding.severity !== "warning") {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Failed SEO findings must use warning severity" });
  }
  if (finding.status !== "failed" && finding.severity !== "info") {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Only failed SEO findings may use warning severity" });
  }
});

export const seoEvaluationSummarySchema = z.object({
  passed: boundedCount,
  warnings: boundedCount,
  notApplicable: boundedCount,
}).strict();

const ruleOrder = seoRuleIdSchema.options;
const zeroSummary = (summary: z.infer<typeof seoEvaluationSummarySchema>) => summary.passed === 0 && summary.warnings === 0 && summary.notApplicable === ruleOrder.length;

export const seoCompletedEvaluationSchema = z.object({
  status: z.literal("completed"),
  summary: seoEvaluationSummarySchema,
  findings: z.array(seoFindingSchema).length(ruleOrder.length),
}).strict().superRefine((evaluation, ctx) => {
  evaluation.findings.forEach((finding, index) => {
    if (finding.ruleId !== ruleOrder[index]) ctx.addIssue({ code: "custom", path: ["findings", index, "ruleId"], message: "Findings must use canonical rule order" });
  });
  const derived = evaluation.findings.reduce((summary, finding) => {
    if (finding.status === "passed") summary.passed += 1;
    if (finding.status === "failed") summary.warnings += 1;
    if (finding.status === "notApplicable") summary.notApplicable += 1;
    return summary;
  }, { passed: 0, warnings: 0, notApplicable: 0 });
  for (const key of ["passed", "warnings", "notApplicable"] as const) {
    if (evaluation.summary[key] !== derived[key]) ctx.addIssue({ code: "custom", path: ["summary", key], message: "Summary does not match findings" });
  }
}).transform((value) => value);

export const seoNotApplicableEvaluationSchema = z.object({
  status: z.literal("notApplicable"),
  reason: seoNotApplicableReasonSchema,
  summary: seoEvaluationSummarySchema,
  findings: z.array(seoFindingSchema).length(ruleOrder.length),
}).strict().superRefine((evaluation, ctx) => {
  evaluation.findings.forEach((finding, index) => {
    if (finding.ruleId !== ruleOrder[index]) ctx.addIssue({ code: "custom", path: ["findings", index, "ruleId"], message: "Findings must use canonical rule order" });
    if (finding.status !== "notApplicable" || finding.severity !== "info") ctx.addIssue({ code: "custom", path: ["findings", index], message: "Navigation failures must mark every rule not applicable" });
  });
  if (!zeroSummary(evaluation.summary)) ctx.addIssue({ code: "custom", path: ["summary"], message: "Not-applicable SEO results must have nine not-applicable findings" });
});

export const seoEvaluationSchema = z.discriminatedUnion("status", [seoCompletedEvaluationSchema, seoNotApplicableEvaluationSchema]);

const metadataBase = {
  schemaVersion: seoSchemaVersionSchema,
  evaluatorVersion: seoEvaluatorVersionSchema,
  scannerRunId: z.string().uuid(),
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  evaluation: seoEvaluationSchema,
};

function serializedSizeGuard(value: unknown, ctx: z.RefinementCtx): void {
  try { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > SEO_MAX_SERIALIZED_BYTES) ctx.addIssue({ code: "custom", message: "Serialized SEO evaluation exceeds 32 KiB" }); }
  catch { ctx.addIssue({ code: "custom", message: "SEO evaluation could not be serialized" }); }
}
export const seoEvaluationCreateSchema = z.object({ provenance: controlledEvaluationProvenanceSchema.optional(), ...metadataBase }).strict().superRefine(serializedSizeGuard);
export const seoEvaluationResponseSchema = z.object({ id: z.string().uuid(), source: z.literal("controlled-scanner"), provenance: controlledEvaluationProvenanceSchema, ...metadataBase, createdAt: z.string().datetime({ offset: true }) }).strict().superRefine(serializedSizeGuard);
export const seoEvaluationIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const seoEvaluationPublicResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  provenance: controlledEvaluationProvenanceSchema,
  schemaVersion: seoSchemaVersionSchema,
  evaluatorVersion: seoEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  evaluation: seoEvaluationSchema,
  createdAt: z.string().datetime({ offset: true }),
  relatedQaEvaluationId: z.string().uuid().nullable(),
  relatedAccessibilityEvaluationId: z.string().uuid().nullable(),
}).strict().superRefine(serializedSizeGuard);

export const seoEvaluationListItemSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  provenance: controlledEvaluationProvenanceSchema,
  evaluatorVersion: seoEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  scannedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  summary: seoEvaluationSummarySchema,
}).strict();

export const seoEvaluationListCursorPayloadSchema = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

export const seoEvaluationListCursorSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/, "Cursor must be a base64url value");
export const listSeoEvaluationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: seoEvaluationListCursorSchema.optional(),
}).strict();
export const listSeoEvaluationsResponseSchema = z.object({
  evaluations: z.array(seoEvaluationListItemSchema).max(50),
  nextCursor: seoEvaluationListCursorSchema.nullable(),
}).strict();

export type SeoEvidence = z.infer<typeof seoEvidenceSchema>;
export type SeoFinding = z.infer<typeof seoFindingSchema>;
export type SeoFindingStatus = z.infer<typeof seoFindingStatusSchema>;
export type SeoSeverity = z.infer<typeof seoSeveritySchema>;
export type SeoEvaluationSummary = z.infer<typeof seoEvaluationSummarySchema>;
export type SeoCompletedEvaluation = z.infer<typeof seoCompletedEvaluationSchema>;
export type SeoNotApplicableEvaluation = z.infer<typeof seoNotApplicableEvaluationSchema>;
export type SeoEvaluation = z.infer<typeof seoEvaluationSchema>;
export type SeoEvaluationCreate = z.infer<typeof seoEvaluationCreateSchema>;
export type SeoEvaluationResponse = z.infer<typeof seoEvaluationResponseSchema>;
export type SeoEvaluationPublicResponse = z.infer<typeof seoEvaluationPublicResponseSchema>;
export type SeoEvaluationListItem = z.infer<typeof seoEvaluationListItemSchema>;
export type SeoEvaluationListCursorPayload = z.infer<typeof seoEvaluationListCursorPayloadSchema>;
export type ListSeoEvaluationsQuery = z.infer<typeof listSeoEvaluationsQuerySchema>;
export type ListSeoEvaluationsResponse = z.infer<typeof listSeoEvaluationsResponseSchema>;
export type SeoRuleId = z.infer<typeof seoRuleIdSchema>;
