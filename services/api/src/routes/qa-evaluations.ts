import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  controlledQaEvaluationCreateSchema,
  qaEvaluationIdParamsSchema,
  type ControlledQaEvaluationCreate,
} from "@siteprobe/contracts";
import {
  QaEvaluationConflictError,
  QaEvaluationPersistenceCorruptionError,
  type QaEvaluationRepository,
} from "../evaluations/repository.js";

type QaRouteOptions = {
  repository: QaEvaluationRepository;
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
    reply.code(503).send(errorEnvelope("SERVICE_UNAVAILABLE", "QA evaluation persistence is not configured", request.id));
    return false;
  }
  if (!hasValidBearer(request, token)) {
    reply.code(401).send(errorEnvelope("UNAUTHORIZED", "Authentication required", request.id));
    return false;
  }
  return true;
}

export const qaEvaluationRoutes = (options: QaRouteOptions): FastifyPluginAsync => async (app) => {
  app.post("/internal/qa-evaluations", async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const parsed = controlledQaEvaluationCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorEnvelope(
        "VALIDATION_ERROR",
        "Request validation failed",
        request.id,
        parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "body", message: issue.message })),
      ));
    }
    try {
      const result = await options.repository.create(parsed.data as ControlledQaEvaluationCreate);
      return reply.code(result.created ? 201 : 200).send(result.evaluation);
    } catch (error) {
      if (error instanceof QaEvaluationConflictError) {
        return reply.code(409).send(errorEnvelope("CONFLICT", error.message, request.id));
      }
      if (error instanceof QaEvaluationPersistenceCorruptionError) throw error;
      throw error;
    }
  });

  app.get("/internal/qa-evaluations/:id", async (request, reply) => {
    if (!authorize(request, reply, options.token)) return;
    const params = qaEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [
        { path: "id", message: "id must be a valid UUID" },
      ]));
    }
    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "QA evaluation not found", request.id));
    return reply.code(200).send(evaluation);
  });
};
