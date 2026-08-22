import type { FastifyPluginAsync } from "fastify";
import { evaluationReportPublicResponseSchema } from "@siteprobe/contracts";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";
import { resolveEvaluationReport } from "../evaluation-reports/aggregate.js";

type EvaluationReportRouteOptions = {
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
  seoRepository: SeoEvaluationRepository;
  seoPublicReadEnabled: boolean;
};

const errorEnvelope = (code: string, message: string, requestId: string) => ({ error: { code, message, requestId } });

export const evaluationReportRoutes = (options: EvaluationReportRouteOptions): FastifyPluginAsync => async (app) => {
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
