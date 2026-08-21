import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationResponseSchema,
  qaEvaluationIdParamsSchema,
  type AccessibilityEvaluationCreate,
} from "@siteprobe/contracts";
import {
  AccessibilityEvaluationConflictError,
  AccessibilityEvaluationPersistenceCorruptionError,
  type AccessibilityEvaluationRepository,
} from "../accessibility-evaluations/repository.js";

const ACCESSIBILITY_BODY_LIMIT_BYTES = 64 * 1024;

type AccessibilityRouteOptions = {
  repository: AccessibilityEvaluationRepository;
  token: string | undefined;
};

function errorEnvelope(code: string, message: string, requestId: string, details?: Array<{ path: string; message: string }>) {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

function hasValidBearer(request: { headers: { authorization?: string } }, token: string): boolean {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256").update(value.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(token).digest();
  return timingSafeEqual(supplied, expected);
}

function authorize(request: { headers: { authorization?: string }; id: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }, token: string | undefined): boolean {
  if (!token) {
    reply.code(503).send(errorEnvelope("SERVICE_UNAVAILABLE", "Accessibility evaluation persistence is not configured", request.id));
    return false;
  }
  if (!hasValidBearer(request, token)) {
    reply.code(401).send(errorEnvelope("UNAUTHORIZED", "Authentication required", request.id));
    return false;
  }
  return true;
}

function isControlledFixtureUrl(value: string | null): boolean {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && url.hostname === "fixture.invalid"
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export const accessibilityEvaluationRoutes = (options: AccessibilityRouteOptions): FastifyPluginAsync => async (app) => {
  app.post("/internal/accessibility-evaluations", { bodyLimit: ACCESSIBILITY_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const parsed = accessibilityEvaluationCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorEnvelope(
        "VALIDATION_ERROR",
        "Request validation failed",
        request.id,
        parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "body", message: issue.message })),
      ));
    }
    if (!isControlledFixtureUrl(parsed.data.requestedUrl) || !isControlledFixtureUrl(parsed.data.finalUrl)) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Accessibility evaluations must use repository-owned fixture URLs", request.id, [
        { path: "requestedUrl", message: "Only fixture.invalid URLs are accepted" },
      ]));
    }
    try {
      const result = await options.repository.create(parsed.data as AccessibilityEvaluationCreate);
      return reply.code(result.created ? 201 : 200).send(result.evaluation);
    } catch (error) {
      if (error instanceof AccessibilityEvaluationConflictError) return reply.code(409).send(errorEnvelope("CONFLICT", error.message, request.id));
      if (error instanceof AccessibilityEvaluationPersistenceCorruptionError) throw error;
      throw error;
    }
  });

  app.get("/internal/accessibility-evaluations/:id", async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const params = qaEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [
        { path: "id", message: "id must be a valid UUID" },
      ]));
    }
    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "Accessibility evaluation not found", request.id));
    return reply.code(200).send(accessibilityEvaluationResponseSchema.parse(evaluation));
  });
};
