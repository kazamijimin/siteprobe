import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { hasValidBearerToken } from "./auth/internal-auth.js";
import type { ScannerConfig } from "./config.js";
import { IsolationGate } from "./isolation/gate.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/ready.js";
import { scanRoutes, type ScannerRunner } from "./routes/scan.js";

export type BuildScannerAppOptions = {
  config: ScannerConfig;
  runScan: ScannerRunner;
  logger?: boolean;
  gate?: IsolationGate;
};

export function buildScannerApp(options: BuildScannerAppOptions): FastifyInstance {
  const app = Fastify({ bodyLimit: 16 * 1024, logger: options.logger ?? false });
  app.removeContentTypeParser("text/plain");
  app.decorate("scannerActive", false);
  const gate = options.gate ?? new IsolationGate(options.config.isolationCapabilities);

  app.setErrorHandler((error, request, reply) => {
    const apiError = error as { code?: string; statusCode?: number };
    if (apiError.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      reply.code(415).send({ error: { code: "INVALID_REQUEST", message: "Request content type must be application/json" } });
      return;
    }
    if (apiError.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      reply.code(413).send({ error: { code: "INVALID_REQUEST", message: "Request payload is too large" } });
      return;
    }
    if (apiError.code === "FST_ERR_CTP_INVALID_JSON_BODY" || apiError.statusCode === 400) {
      reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Request body is invalid" } });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Scanner request is invalid" } });
      return;
    }
    request.log.error({ err: error }, "Unhandled scanner error");
    reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal scanner error" } });
  });

  app.register(healthRoutes);
  app.register(readinessRoutes(options.config, gate));
  app.register(scanRoutes({ config: options.config, gate, runScan: options.runScan }));
  return app;
}
