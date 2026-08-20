import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health.js";
import { scanRoutes } from "./routes/scans.js";
import { InMemoryScanRepository, type ScanRepository } from "./repository.js";

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
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    logger: options.logger ?? false,
  });
  app.removeContentTypeParser("text/plain");
  const repository = options.repository ?? new InMemoryScanRepository();

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
  return app;
}
