import { z } from "zod";

/** Internal-only boundary between the API and the future scanner service. */
export const scannerValidationRequestSchema = z
  .object({
    scanId: z.string().uuid(),
    url: z.string().trim().min(1).max(2048),
  })
  .strict();

export type ScannerValidationRequest = z.infer<
  typeof scannerValidationRequestSchema
>;

export const scannerSecurityFailureCodeSchema = z.enum([
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "CREDENTIALS_NOT_ALLOWED",
  "UNSAFE_IP",
  "UNSAFE_DNS_RESULT",
  "DNS_RESOLUTION_FAILED",
  "UNSAFE_REDIRECT",
  "METHOD_NOT_ALLOWED",
  "WEBSOCKET_BLOCKED",
]);

export type ScannerSecurityFailureCode = z.infer<
  typeof scannerSecurityFailureCodeSchema
>;

export const scannerRunFailureCodeSchema = z.enum([
  "UNSAFE_TARGET",
  "DNS_FAILURE",
  "NAVIGATION_TIMEOUT",
  "NAVIGATION_FAILED",
  "REQUEST_LIMIT_EXCEEDED",
  "JOB_TIMEOUT",
  "BROWSER_LAUNCH_FAILED",
  "BROWSER_CRASHED",
]);

export type ScannerRunFailureCode = z.infer<typeof scannerRunFailureCodeSchema>;

export const scannerSafetyEvaluationSchema = z
  .discriminatedUnion("allowed", [
    z.object({
      allowed: z.literal(true),
      normalizedUrl: z.string().url(),
      resolvedAddresses: z.array(z.string()).min(1),
    }),
    z.object({
      allowed: z.literal(false),
      reason: scannerSecurityFailureCodeSchema,
    }),
  ])
  .readonly();

export type ScannerSafetyEvaluation = z.infer<
  typeof scannerSafetyEvaluationSchema
>;

const boundedObservationTextSchema = z.string().max(2048);

export const scannerFailedRequestSchema = z
  .object({
    url: z.string().max(2048),
    method: z.string().max(16),
    resourceType: z.string().max(64),
    failureReason: z.string().max(512),
  })
  .strict();

export type ScannerFailedRequest = z.infer<typeof scannerFailedRequestSchema>;

/** Internal observation result. This is deliberately not part of ScanResponse. */
export const scannerResultSchema = z
  .object({
    scanId: z.string().uuid(),
    requestedUrl: z.string().max(2048),
    finalUrl: z.string().max(2048).nullable(),
    navigationSucceeded: z.boolean(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    pageTitle: z.string().max(512).nullable(),
    navigationDurationMs: z.number().int().nonnegative(),
    consoleErrors: z.array(boundedObservationTextSchema).max(100),
    pageErrors: z.array(boundedObservationTextSchema).max(100),
    failedRequests: z.array(scannerFailedRequestSchema).max(100),
    scannedAt: z.string().datetime({ offset: true }),
    failureCode: scannerRunFailureCodeSchema.optional(),
  })
  .strict();

export type ScannerResult = z.infer<typeof scannerResultSchema>;
