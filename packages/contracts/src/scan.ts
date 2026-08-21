import { z } from "zod";

const MAX_URL_LENGTH = 2048;
const MAX_HISTORY_SEARCH_LENGTH = 200;

export const scanStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);

export type ScanStatus = z.infer<typeof scanStatusSchema>;

function validateUrl(value: string, context: z.RefinementCtx): void {
  if (value.length === 0) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "URL must be a valid absolute HTTP or HTTPS URL",
    });
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "URL protocol must be HTTP or HTTPS",
    });
  }

  if (!parsed.hostname) {
    context.addIssue({ code: "custom", message: "URL must include a hostname" });
  }

  if (parsed.username || parsed.password) {
    context.addIssue({
      code: "custom",
      message: "URL credentials are not allowed",
    });
  }
}

export function normalizeUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL protocol must be HTTP or HTTPS");
  }
  if (!parsed.hostname) {
    throw new Error("URL must include a hostname");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }
  parsed.hash = "";
  return parsed.toString();
}

const normalizedUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
  .superRefine(validateUrl)
  .transform(normalizeUrl);

export const createScanRequestSchema = z
  .object({
    url: normalizedUrlSchema,
  })
  .strict();

export type CreateScanRequest = z.infer<typeof createScanRequestSchema>;

export const scanSummarySchema = z
  .object({
    critical: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  })
  .strict();

export type ScanSummary = z.infer<typeof scanSummarySchema>;

export const scanResponseSchema = z
  .object({
    id: z.string().uuid(),
    provenance: z.literal("synthetic"),
    url: normalizedUrlSchema,
    status: scanStatusSchema,
    score: z.number().min(0).max(100).nullable(),
    summary: scanSummarySchema,
    createdAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type ScanResponse = z.infer<typeof scanResponseSchema>;

const historySearchValueSchema = z
  .string()
  .min(1, "Search query must not be empty")
  .max(MAX_HISTORY_SEARCH_LENGTH, `Search query must be at most ${MAX_HISTORY_SEARCH_LENGTH} characters`)
  .refine((value) => !value.includes("\u0000"), "Search query contains an unsupported character");

export const scanHistorySearchQuerySchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  historySearchValueSchema.optional(),
);

export type ScanHistorySearchQuery = z.infer<typeof scanHistorySearchQuerySchema>;

export const scanCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor must be a base64url value");

export const scanCursorQueryHashSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/, "Query hash must be a base64url value");

export const scanCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    queryHash: scanCursorQueryHashSchema.optional(),
  })
  .strict();

export type ScanCursorPayload = z.infer<typeof scanCursorPayloadSchema>;

export const listScansQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: scanCursorSchema.optional(),
    q: scanHistorySearchQuerySchema,
  })
  .strict();

export type ListScansQuery = z.infer<typeof listScansQuerySchema>;

export const listScansResponseSchema = z
  .object({
    items: z.array(scanResponseSchema).max(50),
    nextCursor: scanCursorSchema.nullable(),
  })
  .strict();

export type ListScansResponse = z.infer<typeof listScansResponseSchema>;

export const scanIdParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNSUPPORTED_MEDIA_TYPE",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorDetailSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .strict();

export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string(),
        requestId: z.string().min(1),
        details: z.array(errorDetailSchema).optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
