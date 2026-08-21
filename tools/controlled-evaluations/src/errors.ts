export type WorkflowErrorStage =
  | "INVALID_FIXTURE"
  | "INVALID_CONFIGURATION"
  | "API_UNAVAILABLE"
  | "FIXTURE_EXECUTION_FAILURE"
  | "SCANNER_INVALID_RESULT"
  | "EVALUATION_FAILURE"
  | "INGESTION_AUTH_FAILURE"
  | "INGESTION_VALIDATION_FAILURE"
  | "INGESTION_CONFLICT"
  | "INGESTION_UNAVAILABLE"
  | "INGESTION_INVALID_RESPONSE"
  | "ACCESSIBILITY_ENGINE_FAILURE"
  | "ACCESSIBILITY_RESULT_INVALID"
  | "ACCESSIBILITY_INGESTION_AUTH_FAILURE"
  | "ACCESSIBILITY_INGESTION_VALIDATION_FAILURE"
  | "ACCESSIBILITY_INGESTION_CONFLICT"
  | "ACCESSIBILITY_INGESTION_UNAVAILABLE"
  | "ACCESSIBILITY_INGESTION_INVALID_RESPONSE"
  | "SEO_INGESTION_AUTH_FAILURE"
  | "SEO_INGESTION_VALIDATION_FAILURE"
  | "SEO_INGESTION_CONFLICT"
  | "SEO_INGESTION_UNAVAILABLE"
  | "SEO_INGESTION_INVALID_RESPONSE";

export class ControlledEvaluationError extends Error {
  readonly stage: WorkflowErrorStage;
  readonly statusCode?: number;
  readonly safeCode?: string;
  readonly scannerRunId?: string;

  constructor(
    stage: WorkflowErrorStage,
    message: string,
    options: { statusCode?: number; safeCode?: string; scannerRunId?: string } = {},
  ) {
    super(message);
    this.name = "ControlledEvaluationError";
    this.stage = stage;
    this.statusCode = options.statusCode;
    this.safeCode = options.safeCode;
    this.scannerRunId = options.scannerRunId;
  }
}
