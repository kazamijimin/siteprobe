import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationErrorEnvelopeSchema,
  controlledQaEvaluationResponseSchema,
  type ControlledQaEvaluationCreate,
  type ControlledQaEvaluationResponse,
} from "@siteprobe/contracts";
import { ControlledEvaluationError } from "./errors.js";
import type { ControlledEvaluationToolConfig } from "./config.js";

export type ToolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function endpoint(apiUrl: URL, path: string): URL {
  return new URL(path, apiUrl);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    return undefined;
  }
}

function safeApiError(response: Response, body: unknown, stage: "API_UNAVAILABLE" | "INGESTION_UNAVAILABLE" | "INGESTION_AUTH_FAILURE" | "INGESTION_VALIDATION_FAILURE" | "INGESTION_CONFLICT"): ControlledEvaluationError {
  const parsed = controlledQaEvaluationErrorEnvelopeSchema.safeParse(body);
  return new ControlledEvaluationError(stage, parsed.success ? parsed.data.error.message : `API request failed with status ${response.status}`, {
    statusCode: response.status,
    safeCode: parsed.success ? parsed.data.error.code : undefined,
  });
}

export function createApiClient(
  config: ControlledEvaluationToolConfig,
  fetchImpl: ToolFetch = fetch,
) {
  return {
    async healthCheck(): Promise<void> {
      let response: Response;
      try {
        response = await fetchImpl(endpoint(config.apiUrl, "/health"), {
          method: "GET",
          redirect: "error",
        });
      } catch {
        throw new ControlledEvaluationError("API_UNAVAILABLE", "SiteProbe API health check failed");
      }
      if (!response.ok) {
        const body = await readJson(response);
        throw safeApiError(response, body, "API_UNAVAILABLE");
      }
    },

    async ingest(payload: ControlledQaEvaluationCreate): Promise<ControlledQaEvaluationResponse> {
      const validatedPayload = controlledQaEvaluationCreateSchema.parse(payload);
      let response: Response;
      try {
        response = await fetchImpl(endpoint(config.apiUrl, "/internal/qa-evaluations"), {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${config.internalToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(validatedPayload),
        });
      } catch {
        throw new ControlledEvaluationError("INGESTION_UNAVAILABLE", "Controlled evaluation ingestion request failed");
      }

      const body = await readJson(response);
      if (response.status === 401) throw safeApiError(response, body, "INGESTION_AUTH_FAILURE");
      if (response.status === 400) throw safeApiError(response, body, "INGESTION_VALIDATION_FAILURE");
      if (response.status === 409) throw safeApiError(response, body, "INGESTION_CONFLICT");
      if (!response.ok) throw safeApiError(response, body, "INGESTION_UNAVAILABLE");

      const parsed = controlledQaEvaluationResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ControlledEvaluationError("INGESTION_INVALID_RESPONSE", "API returned an invalid controlled evaluation");
      }
      return parsed.data;
    },
  };
}

export type ControlledEvaluationApiClient = ReturnType<typeof createApiClient>;
