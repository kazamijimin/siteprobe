import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationListItemSchema,
  controlledQaEvaluationPublicResponseSchema,
  ACCESSIBILITY_EVALUATOR_VERSION,
  AXE_ENGINE_VERSION,
  listControlledQaEvaluationsQuerySchema,
  listControlledQaEvaluationsResponseSchema,
  qaEvaluationListCursorPayloadSchema,
  qaEvaluationListCursorSchema,
  qaEvaluationIdParamsSchema,
  type ControlledQaEvaluationCreate,
  type ControlledQaEvaluationResponse,
} from "@siteprobe/contracts";
import {
  QaEvaluationConflictError,
  QaEvaluationPersistenceCorruptionError,
  type QaEvaluationRepository,
} from "../evaluations/repository.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";

type QaRouteOptions = {
  repository: QaEvaluationRepository;
  token: string | undefined;
  publicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
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

function projectPublicEvaluation(evaluation: ControlledQaEvaluationResponse, relatedAccessibilityEvaluationId: string | null) {
  const projected = controlledQaEvaluationPublicResponseSchema.safeParse({
    id: evaluation.id,
    source: evaluation.source,
    schemaVersion: evaluation.schemaVersion,
    evaluatorVersion: evaluation.evaluatorVersion,
    requestedUrl: evaluation.requestedUrl,
    finalUrl: evaluation.finalUrl,
    scannedAt: evaluation.scannedAt,
    evaluation: evaluation.evaluation,
    createdAt: evaluation.createdAt,
    relatedAccessibilityEvaluationId,
  });
  if (!projected.success) {
    throw new QaEvaluationPersistenceCorruptionError("Stored QA evaluation failed public contract validation", { cause: projected.error });
  }
  return projected.data;
}

function projectPublicEvaluationListItem(evaluation: ControlledQaEvaluationResponse) {
  const projected = controlledQaEvaluationListItemSchema.safeParse({
    id: evaluation.id,
    source: evaluation.source,
    evaluatorVersion: evaluation.evaluatorVersion,
    requestedUrl: evaluation.requestedUrl,
    scannedAt: evaluation.scannedAt,
    createdAt: evaluation.createdAt,
    summary: evaluation.evaluation.summary,
  });
  if (!projected.success) {
    throw new QaEvaluationPersistenceCorruptionError("Stored QA evaluation failed public list contract validation", { cause: projected.error });
  }
  return projected.data;
}

function encodeCursor(position: { createdAt: string; id: string }): string {
  const payload = qaEvaluationListCursorPayloadSchema.parse({ v: 1, ...position });
  return qaEvaluationListCursorSchema.parse(Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"));
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const validatedCursor = qaEvaluationListCursorSchema.parse(cursor);
  const payload = qaEvaluationListCursorPayloadSchema.parse(
    JSON.parse(Buffer.from(validatedCursor, "base64url").toString("utf8")) as unknown,
  );
  return { createdAt: payload.createdAt, id: payload.id };
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

  app.get("/api/qa-evaluations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "QA evaluations not found", request.id));
    }

    const query = listControlledQaEvaluationsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(errorEnvelope(
        "VALIDATION_ERROR",
        "Request validation failed",
        request.id,
        query.error.issues.map((issue) => ({ path: issue.path.join(".") || "query", message: issue.message })),
      ));
    }

    let before: { createdAt: string; id: string } | undefined;
    if (query.data.cursor) {
      try {
        before = decodeCursor(query.data.cursor);
      } catch {
        return reply.code(400).send(errorEnvelope(
          "VALIDATION_ERROR",
          "Request validation failed",
          request.id,
          [{ path: "cursor", message: "Cursor is invalid" }],
        ));
      }
    }

    const page = await options.repository.list({ limit: query.data.limit, before });
    const response = listControlledQaEvaluationsResponseSchema.parse({
      evaluations: page.evaluations.map(projectPublicEvaluationListItem),
      nextCursor: page.nextPosition ? encodeCursor(page.nextPosition) : null,
    });
    return reply.code(200).send(response);
  });

  app.get("/api/qa-evaluations/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "QA evaluation not found", request.id));
    }

    const params = qaEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [
        { path: "id", message: "id must be a valid UUID" },
      ]));
    }

    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "QA evaluation not found", request.id));
    let relatedAccessibilityEvaluationId: string | null = null;
    if (options.accessibilityPublicReadEnabled) {
      const related = await options.accessibilityRepository.findByScannerRun(
        evaluation.scannerRunId,
        ACCESSIBILITY_EVALUATOR_VERSION,
        AXE_ENGINE_VERSION,
      );
      relatedAccessibilityEvaluationId = related?.id ?? null;
    }
    return reply.code(200).send(projectPublicEvaluation(evaluation, relatedAccessibilityEvaluationId));
  });
};
