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
  | "INGESTION_INVALID_RESPONSE";

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
