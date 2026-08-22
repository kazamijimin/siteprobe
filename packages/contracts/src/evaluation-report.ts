import { z } from "zod";
import { controlledEvaluationProvenanceSchema } from "./provenance.js";
import { qaEvaluationSummarySchema } from "./qa-evaluation.js";
import { accessibilityImpactSchema, accessibilitySummarySchema } from "./accessibility-evaluation.js";
import { seoEvaluationSummarySchema } from "./seo-evaluation.js";

export const EVALUATION_REPORT_SCHEMA_VERSION = 1 as const;
export const evaluationReportSchemaVersionSchema = z.literal(EVALUATION_REPORT_SCHEMA_VERSION);

export const evaluationReportUnavailableReasonSchema = z.enum(["not-produced", "public-access-disabled"]);

const reportUnavailableSchema = z.object({
  available: z.literal(false),
  reason: evaluationReportUnavailableReasonSchema,
}).strict();

export const evaluationReportQaSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), evaluationId: z.string().uuid(), summary: qaEvaluationSummarySchema }).strict(),
  reportUnavailableSchema,
]);

export const evaluationReportAccessibilitySchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), evaluationId: z.string().uuid(), summary: accessibilitySummarySchema }).strict(),
  reportUnavailableSchema,
]);

export const evaluationReportSeoSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), evaluationId: z.string().uuid(), summary: seoEvaluationSummarySchema }).strict(),
  reportUnavailableSchema,
]);

export const evaluationReportAttentionSourceSchema = z.enum(["qa", "accessibility", "seo"]);
export const evaluationReportAttentionSeveritySchema = z.enum(["critical", "warning", "serious", "moderate", "minor", "needsReview"]);
export const evaluationReportAttentionItemSchema = z.object({
  source: evaluationReportAttentionSourceSchema,
  severity: evaluationReportAttentionSeveritySchema,
  ruleId: z.string().min(1).max(64),
  title: z.string().min(1).max(128),
  description: z.string().min(1).max(512),
  impact: accessibilityImpactSchema.optional(),
  affectedNodeCount: z.number().int().nonnegative().max(1_000_000).optional(),
  remediation: z.string().max(512).optional(),
}).strict();

export const evaluationReportPublicResponseSchema = z.object({
  schemaVersion: evaluationReportSchemaVersionSchema,
  anchorEvaluationId: z.string().uuid(),
  provenance: controlledEvaluationProvenanceSchema,
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  qa: evaluationReportQaSchema,
  accessibility: evaluationReportAccessibilitySchema,
  seo: evaluationReportSeoSchema,
  attentionItems: z.array(evaluationReportAttentionItemSchema).max(20),
}).strict();

export type EvaluationReportUnavailableReason = z.infer<typeof evaluationReportUnavailableReasonSchema>;
export type EvaluationReportQa = z.infer<typeof evaluationReportQaSchema>;
export type EvaluationReportAccessibility = z.infer<typeof evaluationReportAccessibilitySchema>;
export type EvaluationReportSeo = z.infer<typeof evaluationReportSeoSchema>;
export type EvaluationReportAttentionItem = z.infer<typeof evaluationReportAttentionItemSchema>;
export type EvaluationReportPublicResponse = z.infer<typeof evaluationReportPublicResponseSchema>;
