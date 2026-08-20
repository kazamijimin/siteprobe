import {
  scannerValidationRequestSchema,
  type ScannerInternalErrorCode,
  type ScannerResult,
} from "@siteprobe/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ScannerConfig } from "../config.js";
import { hasValidBearerToken } from "../auth/internal-auth.js";
import { IsolationGate } from "../isolation/gate.js";
import { parseScannerUrl } from "../security/url-policy.js";

const BODY_LIMIT_BYTES = 16 * 1024;

export type ScannerRunner = (input: { scanId: string; url: string }) => Promise<ScannerResult>;

function sendInternalError(
  reply: FastifyReply,
  code: ScannerInternalErrorCode,
  message: string,
  statusCode: number,
): void {
  reply.code(statusCode).send({ error: { code, message } });
}

function controlledTargetAllowed(url: string, config: ScannerConfig): boolean {
  try {
    const parsed = parseScannerUrl(url);
    return config.controlledHosts.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type ScanRouteOptions = {
  config: ScannerConfig;
  gate: IsolationGate;
  runScan: ScannerRunner;
};

export function scanRoutes(options: ScanRouteOptions): FastifyPluginAsync {
  return async (app) => {
    app.post(
      "/internal/scans",
      { bodyLimit: BODY_LIMIT_BYTES },
      async (request: FastifyRequest, reply) => {
        if (!hasValidBearerToken(request.headers.authorization, options.config.internalToken)) {
          sendInternalError(reply, "UNAUTHORIZED", "Unauthorized", 401);
          return;
        }

        const parsed = scannerValidationRequestSchema.safeParse(request.body as unknown);
        if (!parsed.success) {
          sendInternalError(reply, "INVALID_REQUEST", "Scanner request is invalid", 400);
          return;
        }

        if (options.config.executionMode === "isolated" && !options.gate.canExecute("isolated")) {
          sendInternalError(reply, "ISOLATION_NOT_READY", "Scanner isolation is not ready", 503);
          return;
        }
        if (
          options.config.executionMode === "controlled" &&
          !controlledTargetAllowed(parsed.data.url, options.config)
        ) {
          sendInternalError(
            reply,
            "CONTROLLED_TARGET_NOT_ALLOWED",
            "Target is not allowed in controlled mode",
            403,
          );
          return;
        }

        if (app.scannerActive) {
          sendInternalError(reply, "SCANNER_BUSY", "Scanner is busy", 503);
          return;
        }

        app.scannerActive = true;
        try {
          const result = await options.runScan(parsed.data);
          reply.send(result);
        } catch (error) {
          request.log.error({ err: error }, "Scanner execution failed");
          sendInternalError(reply, "INTERNAL_ERROR", "Scanner execution failed", 500);
        } finally {
          app.scannerActive = false;
        }
      },
    );
  };
}

declare module "fastify" {
  interface FastifyInstance {
    scannerActive: boolean;
  }
}
