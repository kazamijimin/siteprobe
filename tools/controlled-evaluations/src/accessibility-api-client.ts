import {
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationResponseSchema,
  controlledQaEvaluationErrorEnvelopeSchema,
  type AccessibilityEvaluationCreate,
  type AccessibilityEvaluationResponse,
} from "@siteprobe/contracts";
import { ControlledEvaluationError } from "./errors.js";
import type { ControlledEvaluationToolConfig } from "./config.js";

export type AccessibilityApiFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function readJson(response: Response): Promise<unknown> {
  return response.text().then((value) => {
    try { return JSON.parse(value) as unknown; } catch { return undefined; }
  });
}

function failure(response: Response, body: unknown, stage: "ACCESSIBILITY_INGESTION_AUTH_FAILURE" | "ACCESSIBILITY_INGESTION_VALIDATION_FAILURE" | "ACCESSIBILITY_INGESTION_CONFLICT" | "ACCESSIBILITY_INGESTION_UNAVAILABLE"): ControlledEvaluationError {
  const parsed = controlledQaEvaluationErrorEnvelopeSchema.safeParse(body);
  return new ControlledEvaluationError(stage, parsed.success ? parsed.data.error.message : `Accessibility API request failed with status ${response.status}`, {
    statusCode: response.status,
    safeCode: parsed.success ? parsed.data.error.code : undefined,
  });
}

export function createAccessibilityApiClient(config: ControlledEvaluationToolConfig, fetchImpl: AccessibilityApiFetch = fetch) {
  return {
    async healthCheck(): Promise<void> {
      try {
        const response = await fetchImpl(new URL("/health", config.apiUrl), { method: "GET", redirect: "error" });
        if (!response.ok) throw failure(response, await readJson(response), "ACCESSIBILITY_INGESTION_UNAVAILABLE");
      } catch (error) {
        if (error instanceof ControlledEvaluationError) throw error;
        throw new ControlledEvaluationError("API_UNAVAILABLE", "SiteProbe API health check failed");
      }
    },
    async ingestAccessibility(payload: AccessibilityEvaluationCreate): Promise<AccessibilityEvaluationResponse> {
      const validated = accessibilityEvaluationCreateSchema.parse(payload);
      let response: Response;
      try {
        response = await fetchImpl(new URL("/internal/accessibility-evaluations", config.apiUrl), {
          method: "POST",
          redirect: "error",
          headers: { authorization: `Bearer ${config.internalToken}`, "content-type": "application/json" },
          body: JSON.stringify(validated),
        });
      } catch {
        throw new ControlledEvaluationError("ACCESSIBILITY_INGESTION_UNAVAILABLE", "Accessibility evaluation ingestion request failed");
      }
      const body = await readJson(response);
      if (response.status === 401) throw failure(response, body, "ACCESSIBILITY_INGESTION_AUTH_FAILURE");
      if (response.status === 400) throw failure(response, body, "ACCESSIBILITY_INGESTION_VALIDATION_FAILURE");
      if (response.status === 409) throw failure(response, body, "ACCESSIBILITY_INGESTION_CONFLICT");
      if (!response.ok) throw failure(response, body, "ACCESSIBILITY_INGESTION_UNAVAILABLE");
      const parsed = accessibilityEvaluationResponseSchema.safeParse(body);
      if (!parsed.success) throw new ControlledEvaluationError("ACCESSIBILITY_INGESTION_INVALID_RESPONSE", "API returned an invalid accessibility evaluation");
      return parsed.data;
    },
  };
}

export type AccessibilityEvaluationApiClient = ReturnType<typeof createAccessibilityApiClient>;
