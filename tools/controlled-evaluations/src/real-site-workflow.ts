import {
  accessibilityEvaluationResponseSchema,
  controlledQaEvaluationResponseSchema,
  seoEvaluationResponseSchema,
  scannerResultSchema,
  type AccessibilityEvaluationResponse,
  type ControlledQaEvaluationResponse,
  type QaEvaluation,
  type ScannerResult,
  type SeoEvaluationResponse,
} from "@siteprobe/contracts";
import { evaluateScannerResult, parseRealSiteUrl, runRealSiteScan, type RealSiteScanResult } from "@siteprobe/scanner";
import { ControlledEvaluationError } from "./errors.js";
import type { ControlledEvaluationToolConfig } from "./config.js";
import { buildIngestionPayload } from "./workflow.js";
import { buildAccessibilityIngestionPayload } from "./accessibility-workflow.js";
import { buildSeoIngestionPayload } from "./seo-workflow.js";
import { createApiClient, type ControlledEvaluationApiClient } from "./api-client.js";
import { createAccessibilityApiClient, type AccessibilityEvaluationApiClient } from "./accessibility-api-client.js";
import { createSeoApiClient, type SeoEvaluationApiClient } from "./seo-api-client.js";

export type RealSiteWorkflowResult = {
  target: string;
  scannerResult: ScannerResult;
  evaluation: QaEvaluation;
  persistedEvaluation: ControlledQaEvaluationResponse;
  accessibility: RealSiteScanResult["accessibility"];
  persistedAccessibilityEvaluation: AccessibilityEvaluationResponse;
  seo: RealSiteScanResult["seo"];
  persistedSeoEvaluation: SeoEvaluationResponse;
};

export type RealSiteWorkflowDependencies = {
  runScan?: (target: string) => Promise<RealSiteScanResult>;
  evaluate?: typeof evaluateScannerResult;
  api?: ControlledEvaluationApiClient;
  accessibilityApi?: AccessibilityEvaluationApiClient;
  seoApi?: SeoEvaluationApiClient;
};

export async function runRealSiteWorkflow(
  config: ControlledEvaluationToolConfig,
  input: unknown,
  dependencies: RealSiteWorkflowDependencies = {},
): Promise<RealSiteWorkflowResult> {
  if (typeof input !== "string") throw new ControlledEvaluationError("REAL_SITE_POLICY_FAILURE", "Target host is not allowed by the developer real-site smoke-test policy.");
  let target: string;
  try {
    target = parseRealSiteUrl(input);
  } catch (error) {
    throw new ControlledEvaluationError("REAL_SITE_POLICY_FAILURE", error instanceof Error ? error.message : "Target URL is not allowed by the developer real-site smoke-test policy.");
  }
  const api = dependencies.api ?? createApiClient(config);
  const accessibilityApi = dependencies.accessibilityApi ?? createAccessibilityApiClient(config);
  const seoApi = dependencies.seoApi ?? createSeoApiClient(config);
  await api.healthCheck();

  let run: RealSiteScanResult;
  try {
    run = await (dependencies.runScan ?? runRealSiteScan)(target);
  } catch {
    throw new ControlledEvaluationError("REAL_SITE_NAVIGATION_FAILURE", "Navigation failed: the real-site scanner could not complete the ReaDirect target");
  }
  const scannerResult = scannerResultSchema.parse(run.scannerResult);
  if (!scannerResult.navigationSucceeded) {
    throw new ControlledEvaluationError("REAL_SITE_NAVIGATION_FAILURE", `Navigation failed: ${scannerResult.failureCode ?? "unknown scanner failure"}`, { scannerRunId: scannerResult.scanId });
  }

  let evaluation: QaEvaluation;
  try { evaluation = (dependencies.evaluate ?? evaluateScannerResult)(scannerResult); }
  catch { throw new ControlledEvaluationError("EVALUATION_FAILURE", "Real-site QA evaluation failed", { scannerRunId: scannerResult.scanId }); }

  let persistedEvaluation: ControlledQaEvaluationResponse;
  try { persistedEvaluation = controlledQaEvaluationResponseSchema.parse(await api.ingest(buildIngestionPayload(scannerResult, evaluation, "real-site-smoke-test"))); }
  catch (error) {
    if (error instanceof ControlledEvaluationError) throw new ControlledEvaluationError(error.stage, error.message, { statusCode: error.statusCode, safeCode: error.safeCode, scannerRunId: scannerResult.scanId });
    throw new ControlledEvaluationError("INGESTION_INVALID_RESPONSE", "API returned an invalid real-site QA evaluation", { scannerRunId: scannerResult.scanId });
  }

  if (run.accessibility.status === "failed") throw new ControlledEvaluationError("ACCESSIBILITY_ENGINE_FAILURE", "Accessibility engine execution failed", { scannerRunId: scannerResult.scanId, safeCode: run.accessibility.code });
  let persistedAccessibilityEvaluation: AccessibilityEvaluationResponse;
  try { persistedAccessibilityEvaluation = accessibilityEvaluationResponseSchema.parse(await accessibilityApi.ingestAccessibility(buildAccessibilityIngestionPayload(scannerResult, run.accessibility, "real-site-smoke-test"))); }
  catch (error) {
    if (error instanceof ControlledEvaluationError) throw new ControlledEvaluationError(error.stage, error.message, { statusCode: error.statusCode, safeCode: error.safeCode, scannerRunId: scannerResult.scanId });
    throw new ControlledEvaluationError("ACCESSIBILITY_INGESTION_INVALID_RESPONSE", "API returned an invalid real-site accessibility evaluation", { scannerRunId: scannerResult.scanId });
  }

  let persistedSeoEvaluation: SeoEvaluationResponse;
  try { persistedSeoEvaluation = seoEvaluationResponseSchema.parse(await seoApi.ingestSeo(buildSeoIngestionPayload(scannerResult, run.seo, "real-site-smoke-test"))); }
  catch (error) {
    if (error instanceof ControlledEvaluationError) throw new ControlledEvaluationError(error.stage, error.message, { statusCode: error.statusCode, safeCode: error.safeCode, scannerRunId: scannerResult.scanId });
    throw new ControlledEvaluationError("SEO_INGESTION_INVALID_RESPONSE", "API returned an invalid real-site SEO evaluation", { scannerRunId: scannerResult.scanId });
  }
  return { target, scannerResult, evaluation, persistedEvaluation, accessibility: run.accessibility, persistedAccessibilityEvaluation, seo: run.seo, persistedSeoEvaluation };
}
