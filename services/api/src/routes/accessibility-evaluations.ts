import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationListCursorPayloadSchema,
  accessibilityEvaluationListCursorSchema,
  accessibilityEvaluationListItemSchema,
  accessibilityEvaluationPublicResponseSchema,
  accessibilityEvaluationIdParamsSchema,
  accessibilityEvaluationResponseSchema,
  listAccessibilityEvaluationsQuerySchema,
  listAccessibilityEvaluationsResponseSchema,
  QA_EVALUATOR_VERSION,
  type AccessibilityEvaluationCreate,
  type AccessibilityEvaluationResponse,
} from "@siteprobe/contracts";
import {
  AccessibilityEvaluationConflictError,
  AccessibilityEvaluationPersistenceCorruptionError,
  type AccessibilityEvaluationRepository,
} from "../accessibility-evaluations/repository.js";
import type { QaEvaluationRepository } from "../evaluations/repository.js";

const ACCESSIBILITY_BODY_LIMIT_BYTES = 64 * 1024;

type AccessibilityRouteOptions = {
  repository: AccessibilityEvaluationRepository;
  token: string | undefined;
  publicReadEnabled: boolean;
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
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

function encodeCursor(position: { createdAt: string; id: string }): string {
  const payload = accessibilityEvaluationListCursorPayloadSchema.parse({ v: 1, ...position });
  return accessibilityEvaluationListCursorSchema.parse(Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"));
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const validatedCursor = accessibilityEvaluationListCursorSchema.parse(cursor);
  const payload = accessibilityEvaluationListCursorPayloadSchema.parse(
    JSON.parse(Buffer.from(validatedCursor, "base64url").toString("utf8")) as unknown,
  );
  return { createdAt: payload.createdAt, id: payload.id };
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
    const params = accessibilityEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [
        { path: "id", message: "id must be a valid UUID" },
      ]));
    }
    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "Accessibility evaluation not found", request.id));
    return reply.code(200).send(accessibilityEvaluationResponseSchema.parse(evaluation));
  });

  app.get("/api/accessibility-evaluations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "Accessibility evaluations not found", request.id));
    }

    const query = listAccessibilityEvaluationsQuerySchema.safeParse(request.query);
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
    const response = listAccessibilityEvaluationsResponseSchema.parse({
      evaluations: page.evaluations.map(projectPublicAccessibilityEvaluationListItem),
      nextCursor: page.nextPosition ? encodeCursor(page.nextPosition) : null,
    });
    return reply.code(200).send(response);
  });

  app.get("/api/accessibility-evaluations/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.publicReadEnabled) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "Accessibility evaluation not found", request.id));
    }

    const params = accessibilityEvaluationIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id, [
        { path: "id", message: "id must be a valid UUID" },
      ]));
    }

    const evaluation = await options.repository.findById(params.data.id);
    if (!evaluation) return reply.code(404).send(errorEnvelope("NOT_FOUND", "Accessibility evaluation not found", request.id));
    let relatedQaEvaluationId: string | null = null;
    if (options.qaPublicReadEnabled) {
      const related = await options.qaRepository.findByScannerRun(
        evaluation.scannerRunId,
        QA_EVALUATOR_VERSION,
      );
      relatedQaEvaluationId = related?.id ?? null;
    }
    return reply.code(200).send(projectPublicAccessibilityEvaluation(evaluation, relatedQaEvaluationId));
  });
};

function projectPublicAccessibilityEvaluation(evaluation: AccessibilityEvaluationResponse, relatedQaEvaluationId: string | null) {
  const projected = accessibilityEvaluationPublicResponseSchema.safeParse({
    id: evaluation.id,
    source: evaluation.source,
    schemaVersion: evaluation.schemaVersion,
    evaluatorVersion: evaluation.evaluatorVersion,
    requestedUrl: evaluation.requestedUrl,
    finalUrl: evaluation.finalUrl,
    scannedAt: evaluation.scannedAt,
    createdAt: evaluation.createdAt,
    engine: {
      engine: evaluation.engine,
      engineVersion: evaluation.engineVersion,
      adapter: evaluation.adapter,
      adapterVersion: evaluation.adapterVersion,
      rulesetTags: evaluation.rulesetTags,
    },
    evaluation: evaluation.evaluation,
    relatedQaEvaluationId,
  });
  if (!projected.success) {
    throw new AccessibilityEvaluationPersistenceCorruptionError("Stored accessibility evaluation failed public contract validation", { cause: projected.error });
  }
  return projected.data;
}

function projectPublicAccessibilityEvaluationListItem(evaluation: AccessibilityEvaluationResponse) {
  const projected = accessibilityEvaluationListItemSchema.safeParse(
    evaluation.evaluation.status === "completed"
      ? {
          id: evaluation.id,
          source: evaluation.source,
          evaluatorVersion: evaluation.evaluatorVersion,
          requestedUrl: evaluation.requestedUrl,
          scannedAt: evaluation.scannedAt,
          createdAt: evaluation.createdAt,
          engine: { engine: evaluation.engine, engineVersion: evaluation.engineVersion },
          status: evaluation.evaluation.status,
          summary: evaluation.evaluation.summary,
        }
      : {
          id: evaluation.id,
          source: evaluation.source,
          evaluatorVersion: evaluation.evaluatorVersion,
          requestedUrl: evaluation.requestedUrl,
          scannedAt: evaluation.scannedAt,
          createdAt: evaluation.createdAt,
          engine: { engine: evaluation.engine, engineVersion: evaluation.engineVersion },
          status: evaluation.evaluation.status,
          reason: evaluation.evaluation.reason,
        },
  );
  if (!projected.success) {
    throw new AccessibilityEvaluationPersistenceCorruptionError("Stored accessibility evaluation failed public list contract validation", { cause: projected.error });
  }
  return projected.data;
}
