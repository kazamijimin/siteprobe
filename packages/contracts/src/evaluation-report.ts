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

const evaluationReportListAvailableSchema = <TSummary extends z.ZodTypeAny>(summarySchema: TSummary) => z.object({
  available: z.literal(true),
  summary: summarySchema,
}).strict();

export const evaluationReportListQaSchema = z.discriminatedUnion("available", [
  evaluationReportListAvailableSchema(qaEvaluationSummarySchema),
  reportUnavailableSchema,
]);

export const evaluationReportListAccessibilitySchema = z.discriminatedUnion("available", [
  evaluationReportListAvailableSchema(accessibilitySummarySchema),
  reportUnavailableSchema,
]);

export const evaluationReportListSeoSchema = z.discriminatedUnion("available", [
  evaluationReportListAvailableSchema(seoEvaluationSummarySchema),
  reportUnavailableSchema,
]);

export const evaluationReportListItemSchema = z.object({
  schemaVersion: evaluationReportSchemaVersionSchema,
  anchorEvaluationId: z.string().uuid(),
  provenance: controlledEvaluationProvenanceSchema,
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  qa: evaluationReportListQaSchema,
  accessibility: evaluationReportListAccessibilitySchema,
  seo: evaluationReportListSeoSchema,
}).strict();

export const evaluationReportListCursorPayloadSchema = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

export const evaluationReportListCursorSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/, "Cursor must be a base64url value");

export const listEvaluationReportsQuerySchema = z.object({
  source: controlledEvaluationProvenanceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: evaluationReportListCursorSchema.optional(),
}).strict();

export const listEvaluationReportsResponseSchema = z.object({
  reports: z.array(evaluationReportListItemSchema).max(50),
  nextCursor: evaluationReportListCursorSchema.nullable(),
}).strict();

export type EvaluationReportUnavailableReason = z.infer<typeof evaluationReportUnavailableReasonSchema>;
export type EvaluationReportQa = z.infer<typeof evaluationReportQaSchema>;
export type EvaluationReportAccessibility = z.infer<typeof evaluationReportAccessibilitySchema>;
export type EvaluationReportSeo = z.infer<typeof evaluationReportSeoSchema>;
export type EvaluationReportAttentionItem = z.infer<typeof evaluationReportAttentionItemSchema>;
export type EvaluationReportPublicResponse = z.infer<typeof evaluationReportPublicResponseSchema>;
export type EvaluationReportListQa = z.infer<typeof evaluationReportListQaSchema>;
export type EvaluationReportListAccessibility = z.infer<typeof evaluationReportListAccessibilitySchema>;
export type EvaluationReportListSeo = z.infer<typeof evaluationReportListSeoSchema>;
export type EvaluationReportListItem = z.infer<typeof evaluationReportListItemSchema>;
export type EvaluationReportListCursorPayload = z.infer<typeof evaluationReportListCursorPayloadSchema>;
export type ListEvaluationReportsQuery = z.infer<typeof listEvaluationReportsQuerySchema>;
export type ListEvaluationReportsResponse = z.infer<typeof listEvaluationReportsResponseSchema>;
