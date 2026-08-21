import { randomUUID } from "node:crypto";
import {
  accessibilityEvaluationSchema,
  type AccessibilityEvaluation,
  type ScannerResult,
} from "@siteprobe/contracts";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "../testing/fixtures.js";
import { runScanWithPageInspector } from "../scan/run-scan.js";
import { collectAccessibility, accessibilityEngineMetadata, type AccessibilityCollectionResult } from "../accessibility/collect-accessibility.js";
import { getAccessibilityFixtureDefinition, type AccessibilityFixtureId } from "./accessibility-catalog.js";

export type ControlledAccessibilityRunResult = {
  scannerResult: ScannerResult;
  accessibility:
    | (AccessibilityCollectionResult & { status: "completed" })
    | { status: "notApplicable"; reason: "navigationFailed"; engine: typeof accessibilityEngineMetadata; evaluation: AccessibilityEvaluation }
    | { status: "failed"; code: "AXE_EXECUTION_FAILED" | "AXE_RESULT_INVALID" };
};

function notApplicableResult(): AccessibilityEvaluation {
  return accessibilityEvaluationSchema.parse({
    status: "notApplicable",
    reason: "navigationFailed",
    summary: {
      violationRules: 0,
      violationNodes: 0,
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      unknownImpact: 0,
      needsReviewRules: 0,
      needsReviewNodes: 0,
    },
    violations: [],
    needsReview: [],
    violationsTruncated: false,
    needsReviewTruncated: false,
    countsCapped: false,
    payloadTruncated: false,
  });
}

export async function runControlledAccessibilityFixture(fixtureId: AccessibilityFixtureId): Promise<ControlledAccessibilityRunResult> {
  const definition = getAccessibilityFixtureDefinition(fixtureId);
  const scanId = randomUUID();
  const url = new URL(definition.path, FIXTURE_URL).toString();
  const run = await runScanWithPageInspector(
    { scanId, url },
    ({ page, state, policy }) => collectAccessibility(page, state, policy),
    {
      resolver: fixtureResolver,
      testOnlyRouteHandler: fixtureRouteHandler,
      limits: definition.limits,
    },
  );
  if (!run.scannerResult.navigationSucceeded) {
    return {
      scannerResult: run.scannerResult,
      accessibility: {
        status: "notApplicable",
        reason: "navigationFailed",
        engine: accessibilityEngineMetadata,
        evaluation: notApplicableResult(),
      },
    };
  }
  const accessibility = run.inspection;
  if (!accessibility) {
    return { scannerResult: run.scannerResult, accessibility: { status: "failed", code: "AXE_EXECUTION_FAILED" } };
  }
  return { scannerResult: run.scannerResult, accessibility };
}
