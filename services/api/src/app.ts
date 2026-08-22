import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health.js";
import { scanRoutes } from "./routes/scans.js";
import { qaEvaluationRoutes } from "./routes/qa-evaluations.js";
import { accessibilityEvaluationRoutes } from "./routes/accessibility-evaluations.js";
import { seoEvaluationRoutes } from "./routes/seo-evaluations.js";
import { evaluationReportRoutes } from "./routes/evaluation-reports.js";
import { InMemoryScanRepository, type ScanRepository } from "./repository.js";
import type { ScannerClient } from "./scanner/client.js";
import { InMemoryQaEvaluationRepository, type QaEvaluationRepository } from "./evaluations/repository.js";
import { InMemoryAccessibilityEvaluationRepository, type AccessibilityEvaluationRepository } from "./accessibility-evaluations/repository.js";
import { InMemorySeoEvaluationRepository, type SeoEvaluationRepository } from "./seo-evaluations/repository.js";

const BODY_LIMIT_BYTES = 16 * 1024;

function errorResponse(
  code: "VALIDATION_ERROR" | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  details?: Array<{ path: string; message: string }>,
) {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
  };
}

export type BuildAppOptions = {
  repository?: ScanRepository;
  logger?: boolean;
  /** Phase G prepares this boundary; public routes intentionally do not use it yet. */
  scannerClient?: ScannerClient;
  qaEvaluationRepository?: QaEvaluationRepository;
  qaEvaluationInternalToken?: string;
  qaEvaluationPublicReadEnabled?: boolean;
  accessibilityEvaluationRepository?: AccessibilityEvaluationRepository;
  accessibilityEvaluationPublicReadEnabled?: boolean;
  realSiteSmokeTestEnabled?: boolean;
  seoEvaluationRepository?: SeoEvaluationRepository;
  seoEvaluationPublicReadEnabled?: boolean;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    logger: options.logger ?? false,
  });
  app.register(cors, {
    origin: [
      /^http:\/\/localhost(?::\d+)?$/,
      /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Accept", "Content-Type"],
  });
  app.removeContentTypeParser("text/plain");
  const repository = options.repository ?? new InMemoryScanRepository();
  const qaEvaluationRepository = options.qaEvaluationRepository ?? new InMemoryQaEvaluationRepository();
  const accessibilityEvaluationRepository = options.accessibilityEvaluationRepository ?? new InMemoryAccessibilityEvaluationRepository();
  const seoEvaluationRepository = options.seoEvaluationRepository ?? new InMemorySeoEvaluationRepository();

  app.setErrorHandler((error, request, reply) => {
    const apiError = error as { code?: string; validation?: unknown };
    if (apiError.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      reply.code(415).send(errorResponse(
        "UNSUPPORTED_MEDIA_TYPE",
        "Request content type must be application/json",
        request.id,
      ));
      return;
    }

    if (error instanceof ZodError || apiError.validation) {
      const details = error instanceof ZodError
        ? error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join(".") : "body",
            message: issue.message,
          }))
        : undefined;
      reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed", request.id, details));
      return;
    }

    if (apiError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      reply.code(413).send(errorResponse(
        "PAYLOAD_TOO_LARGE",
        "Request payload is too large",
        request.id,
      ));
      return;
    }

    if (apiError.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request body must be valid JSON", request.id));
      return;
    }

    request.log.error({ err: error }, "Unhandled API error");
    reply.code(500).send(errorResponse("INTERNAL_ERROR", "Internal server error", request.id));
  });

  app.register(healthRoutes);
  app.register(scanRoutes(repository));
  app.register(qaEvaluationRoutes({
    repository: qaEvaluationRepository,
    token: options.qaEvaluationInternalToken,
    publicReadEnabled: options.qaEvaluationPublicReadEnabled ?? false,
    accessibilityRepository: accessibilityEvaluationRepository,
    accessibilityPublicReadEnabled: options.accessibilityEvaluationPublicReadEnabled ?? false,
    realSiteSmokeTestEnabled: options.realSiteSmokeTestEnabled ?? false,
    seoRepository: seoEvaluationRepository,
    seoPublicReadEnabled: options.seoEvaluationPublicReadEnabled ?? false,
  }));
  app.register(accessibilityEvaluationRoutes({
    repository: accessibilityEvaluationRepository,
    token: options.qaEvaluationInternalToken,
    publicReadEnabled: options.accessibilityEvaluationPublicReadEnabled ?? false,
    qaRepository: qaEvaluationRepository,
    qaPublicReadEnabled: options.qaEvaluationPublicReadEnabled ?? false,
    realSiteSmokeTestEnabled: options.realSiteSmokeTestEnabled ?? false,
    seoRepository: seoEvaluationRepository,
    seoPublicReadEnabled: options.seoEvaluationPublicReadEnabled ?? false,
  }));
  app.register(seoEvaluationRoutes({
    repository: seoEvaluationRepository,
    token: options.qaEvaluationInternalToken,
    realSiteSmokeTestEnabled: options.realSiteSmokeTestEnabled ?? false,
    publicReadEnabled: options.seoEvaluationPublicReadEnabled ?? false,
    qaRepository: qaEvaluationRepository,
    qaPublicReadEnabled: options.qaEvaluationPublicReadEnabled ?? false,
    accessibilityRepository: accessibilityEvaluationRepository,
    accessibilityPublicReadEnabled: options.accessibilityEvaluationPublicReadEnabled ?? false,
  }));
  app.register(evaluationReportRoutes({
    qaRepository: qaEvaluationRepository,
    qaPublicReadEnabled: options.qaEvaluationPublicReadEnabled ?? false,
    accessibilityRepository: accessibilityEvaluationRepository,
    accessibilityPublicReadEnabled: options.accessibilityEvaluationPublicReadEnabled ?? false,
    seoRepository: seoEvaluationRepository,
    seoPublicReadEnabled: options.seoEvaluationPublicReadEnabled ?? false,
  }));
  return app;
}
