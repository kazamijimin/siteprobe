import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  ACCESSIBILITY_EVALUATOR_VERSION,
  AXE_ENGINE_VERSION,
  QA_EVALUATOR_VERSION,
  SEO_EVALUATOR_VERSION,
  listSeoEvaluationsQuerySchema,
  listSeoEvaluationsResponseSchema,
  seoEvaluationCreateSchema,
  seoEvaluationIdParamsSchema,
  seoEvaluationListCursorPayloadSchema,
  seoEvaluationListCursorSchema,
  seoEvaluationListItemSchema,
  seoEvaluationPublicResponseSchema,
  seoEvaluationResponseSchema,
  type SeoEvaluationCreate,
  type SeoEvaluationResponse,
} from "@siteprobe/contracts";
import { SeoEvaluationConflictError, SeoEvaluationPersistenceCorruptionError, type SeoEvaluationRepository } from "../seo-evaluations/repository.js";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import { isControlledEvaluationUrl } from "../real-site-policy.js";
import { isControlledProvenanceTargetAllowed, resolveControlledProvenance } from "../evaluations/provenance.js";

const SEO_BODY_LIMIT_BYTES = 48 * 1024;
type SeoRouteOptions = {
  repository: SeoEvaluationRepository;
  token: string | undefined;
  realSiteSmokeTestEnabled: boolean;
  publicReadEnabled: boolean;
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
};
const errorEnvelope = (code: string, message: string, requestId: string, details?: Array<{ path: string; message: string }>) => ({ error: { code, message, requestId, ...(details ? { details } : {}) } });
function authorize(request: { headers: { authorization?: string }; id: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }, token: string | undefined): boolean {
  if (!token) { reply.code(503).send(errorEnvelope("SERVICE_UNAVAILABLE", "SEO evaluation persistence is not configured", request.id)); return false; }
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) { reply.code(401).send(errorEnvelope("UNAUTHORIZED", "Authentication required", request.id)); return false; }
  const supplied = createHash("sha256").update(value.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(supplied, expected)) { reply.code(401).send(errorEnvelope("UNAUTHORIZED", "Authentication required", request.id)); return false; }
  return true;
}

function encodeCursor(position: { createdAt: string; id: string }): string {
  const payload = seoEvaluationListCursorPayloadSchema.parse({ v: 1, ...position });
  return seoEvaluationListCursorSchema.parse(Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"));
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const validated = seoEvaluationListCursorSchema.parse(cursor);
  const payload = seoEvaluationListCursorPayloadSchema.parse(JSON.parse(Buffer.from(validated, "base64url").toString("utf8")) as unknown);
  return { createdAt: payload.createdAt, id: payload.id };
}

function projectPublicEvaluation(
  evaluation: SeoEvaluationResponse,
  relatedQaEvaluationId: string | null,
  relatedAccessibilityEvaluationId: string | null,
) {
  const projected = seoEvaluationPublicResponseSchema.safeParse({
    id: evaluation.id,
    source: evaluation.source,
    provenance: evaluation.provenance,
    schemaVersion: evaluation.schemaVersion,
    evaluatorVersion: evaluation.evaluatorVersion,
    requestedUrl: evaluation.requestedUrl,
    finalUrl: evaluation.finalUrl,
    scannedAt: evaluation.scannedAt,
    evaluation: evaluation.evaluation,
    createdAt: evaluation.createdAt,
    relatedQaEvaluationId,
    relatedAccessibilityEvaluationId,
  });
  if (!projected.success) throw new SeoEvaluationPersistenceCorruptionError("Stored SEO evaluation failed public contract validation", { cause: projected.error });
  return projected.data;
}

function projectPublicListItem(evaluation: SeoEvaluationResponse) {
  const projected = seoEvaluationListItemSchema.safeParse({
    id: evaluation.id,
    source: evaluation.source,
    provenance: evaluation.provenance,
    evaluatorVersion: evaluation.evaluatorVersion,
    requestedUrl: evaluation.requestedUrl,
    scannedAt: evaluation.scannedAt,
    createdAt: evaluation.createdAt,
    summary: evaluation.evaluation.summary,
  });
  if (!projected.success) throw new SeoEvaluationPersistenceCorruptionError("Stored SEO evaluation failed public list contract validation", { cause: projected.error });
  return projected.data;
}
export const seoEvaluationRoutes = (options: SeoRouteOptions): FastifyPluginAsync => async (app) => {
  app.post("/internal/seo-evaluations", { bodyLimit: SEO_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const parsed = seoEvaluationCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "body", message: issue.message }))));
    const provenance = resolveControlledProvenance(parsed.data.provenance, parsed.data.requestedUrl);
    if (!isControlledProvenanceTargetAllowed(provenance, parsed.data.requestedUrl, parsed.data.finalUrl, options.realSiteSmokeTestEnabled) || !isControlledEvaluationUrl(parsed.data.requestedUrl, options.realSiteSmokeTestEnabled) || !isControlledEvaluationUrl(parsed.data.finalUrl, options.realSiteSmokeTestEnabled)) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "SEO evaluation target is not allowed by the controlled developer policy", request.id, [{ path: "requestedUrl", message: "Only fixture.invalid URLs or the development ReaDirect allowlist are accepted" }]));
    try {
      const result = await options.repository.create(parsed.data as SeoEvaluationCreate);
      return reply.code(result.created ? 201 : 200).send(result.evaluation);
    } catch (error) {
      if (error instanceof SeoEvaluationConflictError) return reply.code(409).send(errorEnvelope("CONFLICT", error.message, request.id));
      if (error instanceof SeoEvaluationPersistenceCorruptionError) throw error;
      throw error;
    }
  });
  app.get("/internal/seo-evaluations/:id", async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const params = seoEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [{ path: "id", message: "id must be a valid UUID" }]));
    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "SEO evaluation not found", request.id));
    return reply.code(200).send(seoEvaluationResponseSchema.parse(evaluation));
  });

  app.get("/api/seo-evaluations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) return reply.code(404).send(errorEnvelope("NOT_FOUND", "SEO evaluations not found", request.id));
    const query = listSeoEvaluationsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, query.error.issues.map((issue) => ({ path: issue.path.join(".") || "query", message: issue.message }))));
    let before: { createdAt: string; id: string } | undefined;
    if (query.data.cursor) {
      try { before = decodeCursor(query.data.cursor); } catch { return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [{ path: "cursor", message: "Cursor is invalid" }])); }
    }
    const page = await options.repository.list({ limit: query.data.limit, before });
    return reply.code(200).send(listSeoEvaluationsResponseSchema.parse({
      evaluations: page.evaluations.map(projectPublicListItem),
      nextCursor: page.nextPosition ? encodeCursor(page.nextPosition) : null,
    }));
  });

  app.get("/api/seo-evaluations/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) return reply.code(404).send(errorEnvelope("NOT_FOUND", "SEO evaluation not found", request.id));
    const params = seoEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [{ path: "id", message: "id must be a valid UUID" }]));
    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "SEO evaluation not found", request.id));
    let relatedQaEvaluationId: string | null = null;
    let relatedAccessibilityEvaluationId: string | null = null;
    if (options.qaPublicReadEnabled) {
      const related = await options.qaRepository.findByScannerRun(evaluation.scannerRunId, QA_EVALUATOR_VERSION);
      relatedQaEvaluationId = related?.id ?? null;
    }
    if (options.accessibilityPublicReadEnabled) {
      const related = await options.accessibilityRepository.findByScannerRun(evaluation.scannerRunId, ACCESSIBILITY_EVALUATOR_VERSION, AXE_ENGINE_VERSION);
      relatedAccessibilityEvaluationId = related?.id ?? null;
    }
    return reply.code(200).send(projectPublicEvaluation(evaluation, relatedQaEvaluationId, relatedAccessibilityEvaluationId));
  });
};
