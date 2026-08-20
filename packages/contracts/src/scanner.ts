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
