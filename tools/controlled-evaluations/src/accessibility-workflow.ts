import {
  ACCESSIBILITY_EVALUATOR_VERSION,
  ACCESSIBILITY_SCHEMA_VERSION,
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationResponseSchema,
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationResponseSchema,
  QA_EVALUATOR_VERSION,
  QA_SCHEMA_VERSION,
  scannerResultSchema,
  type AccessibilityEvaluationCreate,
  type AccessibilityEvaluationResponse,
  type ControlledQaEvaluationResponse,
  type QaEvaluation,
  type ScannerResult,
} from "@siteprobe/contracts";
import { evaluateScannerResult } from "@siteprobe/scanner";
import { runControlledAccessibilityFixture, accessibilityFixtureIdSchema, type AccessibilityFixtureId, type ControlledAccessibilityRunResult } from "@siteprobe/scanner/controlled-accessibility";
import { ControlledEvaluationError } from "./errors.js";
import type { ControlledEvaluationToolConfig } from "./config.js";
import { createApiClient, type ControlledEvaluationApiClient } from "./api-client.js";
import { createAccessibilityApiClient, type AccessibilityEvaluationApiClient } from "./accessibility-api-client.js";

export type ControlledAccessibilityWorkflowResult = {
  fixtureId: AccessibilityFixtureId;
  scannerResult: ScannerResult;
  evaluation: QaEvaluation;
  persistedEvaluation: ControlledQaEvaluationResponse;
  accessibility: ControlledAccessibilityRunResult["accessibility"];
  persistedAccessibilityEvaluation?: AccessibilityEvaluationResponse;
};

export type AccessibilityWorkflowDependencies = {
  runFixture?: typeof runControlledAccessibilityFixture;
  evaluate?: typeof evaluateScannerResult;
  api?: ControlledEvaluationApiClient;
  accessibilityApi?: AccessibilityEvaluationApiClient;
};

function corePayload(scannerResult: ScannerResult, evaluation: QaEvaluation, provenance: "controlled-fixture" | "real-site-smoke-test" = "controlled-fixture") {
  return controlledQaEvaluationCreateSchema.parse({
    provenance,
    schemaVersion: QA_SCHEMA_VERSION,
    evaluatorVersion: QA_EVALUATOR_VERSION,
    scannerRunId: scannerResult.scanId,
    requestedUrl: scannerResult.requestedUrl,
    finalUrl: scannerResult.finalUrl,
    scannedAt: scannerResult.scannedAt,
    evaluation,
  });
}

export function buildAccessibilityIngestionPayload(scannerResult: ScannerResult, result: ControlledAccessibilityRunResult["accessibility"], provenance: "controlled-fixture" | "real-site-smoke-test" = "controlled-fixture"): AccessibilityEvaluationCreate {
  if (result.status === "failed") throw new ControlledEvaluationError("ACCESSIBILITY_ENGINE_FAILURE", "Accessibility engine execution failed", { scannerRunId: scannerResult.scanId, safeCode: result.code });
  return accessibilityEvaluationCreateSchema.parse({
    provenance,
    schemaVersion: ACCESSIBILITY_SCHEMA_VERSION,
    evaluatorVersion: ACCESSIBILITY_EVALUATOR_VERSION,
    scannerRunId: scannerResult.scanId,
    requestedUrl: scannerResult.requestedUrl,
    finalUrl: scannerResult.finalUrl,
    scannedAt: scannerResult.scannedAt,
    engine: result.engine.engine,
    engineVersion: result.engine.engineVersion,
    adapter: result.engine.adapter,
    adapterVersion: result.engine.adapterVersion,
    rulesetTags: result.engine.rulesetTags,
    evaluation: result.evaluation,
  });
}

export async function runControlledAccessibilityWorkflow(config: ControlledEvaluationToolConfig, input: unknown, dependencies: AccessibilityWorkflowDependencies = {}): Promise<ControlledAccessibilityWorkflowResult> {
  const parsedFixture = accessibilityFixtureIdSchema.safeParse(input);
  if (!parsedFixture.success) throw new ControlledEvaluationError("INVALID_FIXTURE", "Unknown controlled accessibility fixture");
  const fixtureId = parsedFixture.data;
  const api = dependencies.api ?? createApiClient(config);
  const accessibilityApi = dependencies.accessibilityApi ?? createAccessibilityApiClient(config);
  await api.healthCheck();
  const run = await (dependencies.runFixture ?? runControlledAccessibilityFixture)(fixtureId);
  const scannerResult = scannerResultSchema.parse(run.scannerResult);
  let evaluation: QaEvaluation;
  try { evaluation = (dependencies.evaluate ?? evaluateScannerResult)(scannerResult); }
  catch { throw new ControlledEvaluationError("EVALUATION_FAILURE", "Controlled QA evaluation failed", { scannerRunId: scannerResult.scanId }); }
  let persistedEvaluation: ControlledQaEvaluationResponse;
  try {
    persistedEvaluation = controlledQaEvaluationResponseSchema.parse(await api.ingest(corePayload(scannerResult, evaluation)));
  } catch (error) {
    if (error instanceof ControlledEvaluationError) {
      throw new ControlledEvaluationError(error.stage, error.message, { statusCode: error.statusCode, safeCode: error.safeCode, scannerRunId: scannerResult.scanId });
    }
    throw new ControlledEvaluationError("INGESTION_INVALID_RESPONSE", "API returned an invalid controlled evaluation", { scannerRunId: scannerResult.scanId });
  }
  let payload: AccessibilityEvaluationCreate;
  try { payload = buildAccessibilityIngestionPayload(scannerResult, run.accessibility); }
  catch (error) {
    if (error instanceof ControlledEvaluationError) throw error;
    throw new ControlledEvaluationError("ACCESSIBILITY_RESULT_INVALID", "Accessibility result failed contract validation", { scannerRunId: scannerResult.scanId });
  }
  let persistedAccessibilityEvaluation: AccessibilityEvaluationResponse;
  try { persistedAccessibilityEvaluation = accessibilityEvaluationResponseSchema.parse(await accessibilityApi.ingestAccessibility(payload)); }
  catch (error) {
    if (error instanceof ControlledEvaluationError) throw new ControlledEvaluationError(error.stage, error.message, { statusCode: error.statusCode, safeCode: error.safeCode, scannerRunId: scannerResult.scanId });
    throw new ControlledEvaluationError("ACCESSIBILITY_INGESTION_INVALID_RESPONSE", "API returned an invalid accessibility evaluation", { scannerRunId: scannerResult.scanId });
  }
  return { fixtureId, scannerResult, evaluation, persistedEvaluation, accessibility: run.accessibility, persistedAccessibilityEvaluation };
}
