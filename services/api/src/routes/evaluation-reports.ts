import type { FastifyPluginAsync } from "fastify";
import {
  evaluationReportListCursorPayloadSchema,
  evaluationReportListCursorSchema,
  evaluationReportPublicResponseSchema,
  listEvaluationReportsQuerySchema,
  listEvaluationReportsResponseSchema,
} from "@siteprobe/contracts";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";
import { resolveEvaluationReport } from "../evaluation-reports/aggregate.js";
import type { EvaluationReportHistoryRepository } from "../evaluation-reports/history.js";

type EvaluationReportRouteOptions = {
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
  seoRepository: SeoEvaluationRepository;
  seoPublicReadEnabled: boolean;
  historyRepository: EvaluationReportHistoryRepository;
};

const errorEnvelope = (code: string, message: string, requestId: string) => ({ error: { code, message, requestId } });

export const evaluationReportRoutes = (options: EvaluationReportRouteOptions): FastifyPluginAsync => async (app) => {
  app.get("/api/evaluation-reports", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!options.qaPublicReadEnabled && !options.accessibilityPublicReadEnabled && !options.seoPublicReadEnabled) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "Evaluation reports not found", request.id));
    }
    const parsedQuery = listEvaluationReportsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id));
    }
    let before: { createdAt: string; id: string } | undefined;
    if (parsedQuery.data.cursor) {
      try {
        const cursor = evaluationReportListCursorPayloadSchema.parse(
          JSON.parse(Buffer.from(evaluationReportListCursorSchema.parse(parsedQuery.data.cursor), "base64url").toString("utf8")) as unknown,
        );
        before = { createdAt: cursor.createdAt, id: cursor.id };
      } catch {
        return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Request validation failed", request.id));
      }
    }
    const page = await options.historyRepository.list({
      limit: parsedQuery.data.limit,
      before,
      provenance: parsedQuery.data.source,
    });
    const nextCursor = page.nextPosition
      ? evaluationReportListCursorSchema.parse(Buffer.from(JSON.stringify(evaluationReportListCursorPayloadSchema.parse({ v: 1, ...page.nextPosition })), "utf8").toString("base64url"))
      : null;
    return reply.code(200).send(listEvaluationReportsResponseSchema.parse({ reports: page.reports, nextCursor }));
  });

  app.get("/api/evaluation-reports/:evaluationId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const evaluationId = typeof (request.params as { evaluationId?: unknown }).evaluationId === "string"
      ? (request.params as { evaluationId: string }).evaluationId
      : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evaluationId)) {
      return reply.code(404).send(errorEnvelope("NOT_FOUND", "Evaluation report not found", request.id));
    }
    const report = await resolveEvaluationReport(evaluationId, options);
    if (!report) return reply.code(404).send(errorEnvelope("NOT_FOUND", "Evaluation report not found", request.id));
    return reply.code(200).send(evaluationReportPublicResponseSchema.parse(report));
  });
};
