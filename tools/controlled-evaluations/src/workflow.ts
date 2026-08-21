import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationResponseSchema,
  QA_EVALUATOR_VERSION,
  QA_SCHEMA_VERSION,
  scannerResultSchema,
  type ControlledQaEvaluationCreate,
  type ControlledQaEvaluationResponse,
  type QaEvaluation,
  type ScannerResult,
} from "@siteprobe/contracts";
import {
  controlledFixtureIdSchema,
  evaluateScannerResult,
  runControlledFixture,
  type ControlledFixtureId,
} from "@siteprobe/scanner";
import { ControlledEvaluationError } from "./errors.js";
import type { ControlledEvaluationToolConfig } from "./config.js";
import { createApiClient, type ControlledEvaluationApiClient } from "./api-client.js";

export type ControlledEvaluationWorkflowResult = {
  fixtureId: ControlledFixtureId;
  scannerResult: ScannerResult;
  evaluation: QaEvaluation;
  persistedEvaluation: ControlledQaEvaluationResponse;
};

export type WorkflowDependencies = {
  runFixture?: typeof runControlledFixture;
  evaluate?: typeof evaluateScannerResult;
  api?: ControlledEvaluationApiClient;
};

export function buildIngestionPayload(
  scannerResult: ScannerResult,
  evaluation: QaEvaluation,
): ControlledQaEvaluationCreate {
  return controlledQaEvaluationCreateSchema.parse({
    schemaVersion: QA_SCHEMA_VERSION,
    evaluatorVersion: QA_EVALUATOR_VERSION,
    scannerRunId: scannerResult.scanId,
    requestedUrl: scannerResult.requestedUrl,
    finalUrl: scannerResult.finalUrl,
    scannedAt: scannerResult.scannedAt,
    evaluation,
  });
}

export async function runControlledEvaluationWorkflow(
  config: ControlledEvaluationToolConfig,
  input: unknown,
  dependencies: WorkflowDependencies = {},
): Promise<ControlledEvaluationWorkflowResult> {
  const fixtureIdResult = controlledFixtureIdSchema.safeParse(input);
  if (!fixtureIdResult.success) {
    throw new ControlledEvaluationError("INVALID_FIXTURE", "Unknown controlled fixture");
  }
  const fixtureId = fixtureIdResult.data;
  const api = dependencies.api ?? createApiClient(config);
  await api.healthCheck();

  let scannerResult: ScannerResult;
  try {
    scannerResult = scannerResultSchema.parse(await (dependencies.runFixture ?? runControlledFixture)(fixtureId));
  } catch (error) {
    if (error instanceof ControlledEvaluationError) throw error;
    throw new ControlledEvaluationError("SCANNER_INVALID_RESULT", "Controlled scanner did not return a valid ScannerResult");
  }

  let evaluation: QaEvaluation;
  try {
    evaluation = (dependencies.evaluate ?? evaluateScannerResult)(scannerResult);
  } catch {
    throw new ControlledEvaluationError("EVALUATION_FAILURE", "Controlled QA evaluation failed", { scannerRunId: scannerResult.scanId });
  }

  let payload: ControlledQaEvaluationCreate;
  try {
    payload = buildIngestionPayload(scannerResult, evaluation);
  } catch {
    throw new ControlledEvaluationError("EVALUATION_FAILURE", "Controlled QA evaluation payload failed validation", { scannerRunId: scannerResult.scanId });
  }

  try {
    const persistedEvaluation = controlledQaEvaluationResponseSchema.parse(await api.ingest(payload));
    return { fixtureId, scannerResult, evaluation, persistedEvaluation };
  } catch (error) {
    if (error instanceof ControlledEvaluationError) {
      if (!error.scannerRunId) {
        throw new ControlledEvaluationError(error.stage, error.message, {
          statusCode: error.statusCode,
          safeCode: error.safeCode,
          scannerRunId: scannerResult.scanId,
        });
      }
      throw error;
    }
    throw new ControlledEvaluationError("INGESTION_INVALID_RESPONSE", "API returned an invalid controlled evaluation", { scannerRunId: scannerResult.scanId });
  }
}

export { runControlledAccessibilityWorkflow } from "./accessibility-workflow.js";
export type { ControlledAccessibilityWorkflowResult } from "./accessibility-workflow.js";
export { runControlledSeoWorkflow, buildSeoIngestionPayload } from "./seo-workflow.js";
export type { ControlledSeoWorkflowResult } from "./seo-workflow.js";
