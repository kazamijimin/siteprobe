import { z } from "zod";
import { scannerRunFailureCodeSchema } from "./scanner.js";

export const QA_SCHEMA_VERSION = 1 as const;
export const QA_EVALUATOR_VERSION = 1 as const;

export const qaSchemaVersionSchema = z.literal(QA_SCHEMA_VERSION);
export const qaEvaluatorVersionSchema = z.literal(QA_EVALUATOR_VERSION);

export const qaCategorySchema = z.enum(["navigation", "document", "runtime", "network"]);
export const qaRuleIdSchema = z.enum([
  "NAVIGATION_COMPLETED",
  "HTTP_STATUS_ACCEPTABLE",
  "DOCUMENT_TITLE_PRESENT",
  "NO_CONSOLE_ERRORS",
  "NO_PAGE_ERRORS",
  "NO_FAILED_REQUESTS",
]);
export const qaFindingStatusSchema = z.enum(["passed", "failed", "notApplicable"]);
export const qaSeveritySchema = z.enum(["info", "warning", "critical"]);

const boundedString = (max: number) => z.string().max(max);

export const qaFailedRequestEvidenceSchema = z.object({
  url: boundedString(512),
  method: boundedString(16),
  resourceType: boundedString(64),
  failureReason: boundedString(256),
}).strict();

export const qaEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigation"),
    navigationSucceeded: z.boolean(),
    failureCode: scannerRunFailureCodeSchema.nullable(),
    requestedUrl: boundedString(2048),
    finalUrl: boundedString(2048).nullable(),
    navigationDurationMs: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    kind: z.literal("httpStatus"),
    value: z.number().int().min(100).max(599).nullable(),
  }).strict(),
  z.object({
    kind: z.literal("title"),
    present: z.boolean(),
    characterCount: z.number().int().nonnegative().max(512),
  }).strict(),
  z.object({
    kind: z.literal("messages"),
    recordedCount: z.number().int().nonnegative(),
    samples: z.array(boundedString(512)).max(3),
    samplesTruncated: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal("failedRequests"),
    recordedCount: z.number().int().nonnegative(),
    samples: z.array(qaFailedRequestEvidenceSchema).max(3),
    samplesTruncated: z.boolean(),
  }).strict(),
]);

const findingPairings: Record<z.infer<typeof qaRuleIdSchema>, { category: z.infer<typeof qaCategorySchema>; evidence: z.infer<typeof qaEvidenceSchema>["kind"] }> = {
  NAVIGATION_COMPLETED: { category: "navigation", evidence: "navigation" },
  HTTP_STATUS_ACCEPTABLE: { category: "navigation", evidence: "httpStatus" },
  DOCUMENT_TITLE_PRESENT: { category: "document", evidence: "title" },
  NO_CONSOLE_ERRORS: { category: "runtime", evidence: "messages" },
  NO_PAGE_ERRORS: { category: "runtime", evidence: "messages" },
  NO_FAILED_REQUESTS: { category: "network", evidence: "failedRequests" },
};

export const qaFindingSchema = z.object({
  ruleId: qaRuleIdSchema,
  category: qaCategorySchema,
  status: qaFindingStatusSchema,
  severity: qaSeveritySchema,
  title: boundedString(128),
  description: boundedString(512),
  evidence: qaEvidenceSchema,
}).strict().superRefine((finding, ctx) => {
  const expected = findingPairings[finding.ruleId];
  if (finding.category !== expected.category) {
    ctx.addIssue({ code: "custom", path: ["category"], message: "Category does not match rule" });
  }
  if (finding.evidence.kind !== expected.evidence) {
    ctx.addIssue({ code: "custom", path: ["evidence", "kind"], message: "Evidence does not match rule" });
  }
  if (finding.status !== "failed" && finding.severity !== "info") {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Only failed findings may use warning or critical severity" });
  }
  if (finding.status === "failed" && finding.severity === "info") {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "Failed findings must use warning or critical severity" });
  }
});

export const qaEvaluationSummarySchema = z.object({
  critical: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  notApplicable: z.number().int().nonnegative(),
}).strict();

const expectedRuleOrder = Object.keys(findingPairings) as Array<z.infer<typeof qaRuleIdSchema>>;

export const qaEvaluationSchema = z.object({
  findings: z.array(qaFindingSchema).length(6),
  summary: qaEvaluationSummarySchema,
}).strict().superRefine((evaluation, ctx) => {
  evaluation.findings.forEach((finding, index) => {
    if (finding.ruleId !== expectedRuleOrder[index]) {
      ctx.addIssue({ code: "custom", path: ["findings", index, "ruleId"], message: "Findings must use the canonical rule order" });
    }
  });
  const derived = evaluation.findings.reduce((summary, finding) => {
    if (finding.status === "passed") summary.passed += 1;
    if (finding.status === "notApplicable") summary.notApplicable += 1;
    if (finding.status === "failed" && finding.severity === "critical") summary.critical += 1;
    if (finding.status === "failed" && finding.severity === "warning") summary.warnings += 1;
    return summary;
  }, { critical: 0, warnings: 0, passed: 0, notApplicable: 0 });
  for (const key of ["critical", "warnings", "passed", "notApplicable"] as const) {
    if (evaluation.summary[key] !== derived[key]) {
      ctx.addIssue({ code: "custom", path: ["summary", key], message: "Summary does not match findings" });
    }
  }
});

const metadataBase = {
  schemaVersion: qaSchemaVersionSchema,
  evaluatorVersion: qaEvaluatorVersionSchema,
  scannerRunId: z.string().uuid(),
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  evaluation: qaEvaluationSchema,
};

export const controlledQaEvaluationCreateSchema = z.object(metadataBase).strict().superRefine((input, ctx) => {
  const navigation = input.evaluation.findings[0]?.evidence;
  if (!navigation || navigation.kind !== "navigation") return;
  if (navigation.requestedUrl !== input.requestedUrl) {
    ctx.addIssue({ code: "custom", path: ["requestedUrl"], message: "requestedUrl must match navigation evidence" });
  }
  if (navigation.finalUrl !== input.finalUrl) {
    ctx.addIssue({ code: "custom", path: ["finalUrl"], message: "finalUrl must match navigation evidence" });
  }
});

const metadataConsistency = (input: { requestedUrl: string; finalUrl: string | null; evaluation: z.infer<typeof qaEvaluationSchema> }, ctx: z.RefinementCtx) => {
  const navigation = input.evaluation.findings[0]?.evidence;
  if (!navigation || navigation.kind !== "navigation") return;
  if (navigation.requestedUrl !== input.requestedUrl) {
    ctx.addIssue({ code: "custom", path: ["requestedUrl"], message: "requestedUrl must match navigation evidence" });
  }
  if (navigation.finalUrl !== input.finalUrl) {
    ctx.addIssue({ code: "custom", path: ["finalUrl"], message: "finalUrl must match navigation evidence" });
  }
};

export const controlledQaEvaluationResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  ...metadataBase,
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine(metadataConsistency);

export const controlledQaEvaluationPublicResponseSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  schemaVersion: qaSchemaVersionSchema,
  evaluatorVersion: qaEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  finalUrl: z.string().max(2048).nullable(),
  scannedAt: z.string().datetime({ offset: true }),
  evaluation: qaEvaluationSchema,
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine(metadataConsistency);

export const controlledQaEvaluationListItemSchema = z.object({
  id: z.string().uuid(),
  source: z.literal("controlled-scanner"),
  evaluatorVersion: qaEvaluatorVersionSchema,
  requestedUrl: z.string().min(1).max(2048),
  scannedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  summary: qaEvaluationSummarySchema,
}).strict();

export const qaEvaluationListCursorPayloadSchema = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

export const qaEvaluationListCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor must be a base64url value");

export const listControlledQaEvaluationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: qaEvaluationListCursorSchema.optional(),
}).strict();

export const listControlledQaEvaluationsResponseSchema = z.object({
  evaluations: z.array(controlledQaEvaluationListItemSchema).max(50),
  nextCursor: qaEvaluationListCursorSchema.nullable(),
}).strict();

export const qaEvaluationIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const controlledQaEvaluationErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(["VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"]),
    message: z.string(),
    requestId: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() }).strict()).optional(),
  }).strict(),
}).strict();

export type QaCategory = z.infer<typeof qaCategorySchema>;
export type QaRuleId = z.infer<typeof qaRuleIdSchema>;
export type QaFindingStatus = z.infer<typeof qaFindingStatusSchema>;
export type QaSeverity = z.infer<typeof qaSeveritySchema>;
export type QaFailedRequestEvidence = z.infer<typeof qaFailedRequestEvidenceSchema>;
export type QaEvidence = z.infer<typeof qaEvidenceSchema>;
export type QaFinding = z.infer<typeof qaFindingSchema>;
export type QaEvaluationSummary = z.infer<typeof qaEvaluationSummarySchema>;
export type QaEvaluation = z.infer<typeof qaEvaluationSchema>;
export type QaSchemaVersion = z.infer<typeof qaSchemaVersionSchema>;
export type QaEvaluatorVersion = z.infer<typeof qaEvaluatorVersionSchema>;
export type ControlledQaEvaluationCreate = z.infer<typeof controlledQaEvaluationCreateSchema>;
export type ControlledQaEvaluationResponse = z.infer<typeof controlledQaEvaluationResponseSchema>;
export type ControlledQaEvaluationPublicResponse = z.infer<typeof controlledQaEvaluationPublicResponseSchema>;
export type ControlledQaEvaluationListItem = z.infer<typeof controlledQaEvaluationListItemSchema>;
export type QaEvaluationListCursorPayload = z.infer<typeof qaEvaluationListCursorPayloadSchema>;
export type ListControlledQaEvaluationsQuery = z.infer<typeof listControlledQaEvaluationsQuerySchema>;
export type ListControlledQaEvaluationsResponse = z.infer<typeof listControlledQaEvaluationsResponseSchema>;
export type QaEvaluationIdParams = z.infer<typeof qaEvaluationIdParamsSchema>;
export type ControlledQaEvaluationErrorEnvelope = z.infer<typeof controlledQaEvaluationErrorEnvelopeSchema>;
