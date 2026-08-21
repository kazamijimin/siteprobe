import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { seoEvaluationCreateSchema, seoEvaluationIdParamsSchema, seoEvaluationResponseSchema, type SeoEvaluationCreate } from "@siteprobe/contracts";
import { SeoEvaluationConflictError, SeoEvaluationPersistenceCorruptionError, type SeoEvaluationRepository } from "../seo-evaluations/repository.js";
import { isControlledEvaluationUrl } from "../real-site-policy.js";
import { isControlledProvenanceTargetAllowed, resolveControlledProvenance } from "../evaluations/provenance.js";

const SEO_BODY_LIMIT_BYTES = 48 * 1024;
type SeoRouteOptions = { repository: SeoEvaluationRepository; token: string | undefined; realSiteSmokeTestEnabled: boolean };
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
};
