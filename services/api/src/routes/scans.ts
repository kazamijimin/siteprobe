import {
  createScanRequestSchema,
  scanIdParamsSchema,
  scanResponseSchema,
  type ErrorDetail,
} from "@siteprobe/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { ScanRepository } from "../repository.js";

const SYNTHETIC_SCORE = 87;
const SYNTHETIC_SUMMARY = { critical: 2, warnings: 6, passed: 31 } as const;

type ErrorReply = {
  code: "VALIDATION_ERROR" | "NOT_FOUND";
  message: string;
  details?: ErrorDetail[];
};

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: ErrorReply,
  statusCode: number,
): void {
  reply.code(statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      requestId: request.id,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));
}

function createSyntheticScan(url: string) {
  const createdAt = new Date();
  const completedAt = new Date(createdAt.getTime() + 100);
  return scanResponseSchema.parse({
    id: randomUUID(),
    url,
    status: "completed",
    score: SYNTHETIC_SCORE,
    summary: SYNTHETIC_SUMMARY,
    createdAt: createdAt.toISOString(),
    completedAt: completedAt.toISOString(),
  });
}

function requestedUrlFromBody(body: unknown, normalizedUrl: string): string {
  if (typeof body === "object" && body !== null && "url" in body) {
    const candidate = body.url;
    if (typeof candidate === "string") {
      return candidate.trim();
    }
  }
  return normalizedUrl;
}

export function scanRoutes(repository: ScanRepository): FastifyPluginAsync {
  return async (app) => {
    app.post("/api/scans", async (request, reply) => {
      const result = createScanRequestSchema.safeParse(request.body as unknown);
      if (!result.success) {
        sendError(request, reply, {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: zodDetails(result.error),
        }, 400);
        return;
      }

      const scan = await repository.create(
        createSyntheticScan(result.data.url),
        requestedUrlFromBody(request.body, result.data.url),
      );
      reply.code(201).send(scan);
    });

    app.get("/api/scans/:id", async (request, reply) => {
      const paramsResult = scanIdParamsSchema.safeParse(request.params as unknown);
      if (!paramsResult.success) {
        sendError(request, reply, {
          code: "VALIDATION_ERROR",
          message: "Scan id must be a valid UUID",
          details: zodDetails(paramsResult.error),
        }, 400);
        return;
      }

      const scan = await repository.findById(paramsResult.data.id);
      if (!scan) {
        sendError(request, reply, {
          code: "NOT_FOUND",
          message: "Scan not found",
        }, 404);
        return;
      }

      reply.send(scan);
    });
  };
}
