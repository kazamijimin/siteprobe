import { randomUUID } from "node:crypto";
import {
  accessibilityEvaluationSchema,
  type AccessibilityEvaluation,
  type ScannerResult,
  type SeoEvaluation,
} from "@siteprobe/contracts";
import { accessibilityEngineMetadata, collectAccessibility, type AccessibilityCollectionResult } from "./accessibility/collect-accessibility.js";
import { collectSeo, type SeoDomSnapshot } from "./seo/collect-seo.js";
import { evaluateSeo } from "./seo/evaluate-seo.js";
import { runScanWithPageInspector } from "./scan/run-scan.js";
import { parseScannerUrl } from "./security/url-policy.js";

export const REAL_SITE_HOSTS = ["readirect.org", "www.readirect.org"] as const;

export type RealSiteScanResult = {
  scannerResult: ScannerResult;
  accessibility: AccessibilityCollectionResult | { status: "notApplicable"; reason: "navigationFailed"; engine: typeof accessibilityEngineMetadata; evaluation: AccessibilityEvaluation };
  seo: SeoEvaluation;
};

function notApplicableAccessibility(): AccessibilityEvaluation {
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

export function parseRealSiteUrl(input: string): string {
  const parsed = parseScannerUrl(input);
  if (!REAL_SITE_HOSTS.includes(parsed.hostname as (typeof REAL_SITE_HOSTS)[number])) {
    throw new Error("Target host is not allowed by the developer real-site smoke-test policy.");
  }
  return parsed.normalizedUrl;
}

export async function runRealSiteScan(input: string): Promise<RealSiteScanResult> {
  const url = parseRealSiteUrl(input);
  const run = await runScanWithPageInspector(
    { scanId: randomUUID(), url },
    async ({ page, state, policy, scannerResult }) => {
      // ReaDirect emits a short-lived Cloudflare RUM request after the initial
      // load. Let that bounded page activity settle before running axe so the
      // existing no-new-request accessibility invariant remains meaningful.
      await page.waitForTimeout(Math.min(policy.actionTimeoutMs, 3_000));
      const accessibility = await collectAccessibility(page, state, policy);
      let seoSnapshot: SeoDomSnapshot | undefined;
      try {
        seoSnapshot = await collectSeo(page);
      } catch {
        seoSnapshot = undefined;
      }
      return { accessibility, seo: evaluateSeo(scannerResult, seoSnapshot) };
    },
    { topLevelNavigationHosts: REAL_SITE_HOSTS },
  );

  if (!run.inspection) {
    return {
      scannerResult: run.scannerResult,
      accessibility: { status: "notApplicable", reason: "navigationFailed", engine: accessibilityEngineMetadata, evaluation: notApplicableAccessibility() },
      seo: evaluateSeo(run.scannerResult),
    };
  }
  return { scannerResult: run.scannerResult, ...run.inspection };
}
