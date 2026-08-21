import { describe, expect, it } from "vitest";
import { evaluateSeo } from "./evaluate-seo.js";
import type { ScannerResult } from "@siteprobe/contracts";
import type { SeoDomSnapshot } from "./collect-seo.js";

const scannerResult = (navigationSucceeded = true): ScannerResult => ({ scanId: "00000000-0000-4000-8000-000000000001", requestedUrl: "http://fixture.invalid/seo-clean", finalUrl: "http://fixture.invalid/seo-clean", navigationSucceeded, httpStatus: navigationSucceeded ? 200 : null, pageTitle: null, navigationDurationMs: 1, consoleErrors: [], pageErrors: [], failedRequests: [], scannedAt: "2026-08-21T00:00:00.000Z", ...(navigationSucceeded ? {} : { failureCode: "NAVIGATION_TIMEOUT" as const }) });
const snapshot: SeoDomSnapshot = { title: "A deterministic SEO title with enough length", description: "A deterministic description that is long enough to exercise the SEO metadata contract without relying on external content.", canonical: "http://fixture.invalid/seo-clean", robots: null, htmlLang: "en", viewport: "width=device-width", headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }, imageCount: 1, missingAltCount: 0, missingAltSamples: [], internalAnchorCount: 0, externalAnchorCount: 0 };
describe("SEO evaluator", () => {
  it("is deterministic and passes the clean snapshot", () => { const first = evaluateSeo(scannerResult(), snapshot); expect(evaluateSeo(scannerResult(), structuredClone(snapshot))).toEqual(first); expect(first.summary).toEqual({ passed: 9, warnings: 0, notApplicable: 0 }); expect(first.findings.map((f) => f.ruleId)).toEqual(["SEO_TITLE_PRESENT", "SEO_TITLE_LENGTH", "SEO_META_DESCRIPTION_PRESENT", "SEO_META_DESCRIPTION_LENGTH", "SEO_CANONICAL_PRESENT", "SEO_HTML_LANG_PRESENT", "SEO_VIEWPORT_PRESENT", "SEO_SINGLE_H1", "SEO_IMAGES_HAVE_ALT"]); });
  it("does not inspect a failed navigation", () => expect(evaluateSeo(scannerResult(false), snapshot)).toMatchObject({ status: "notApplicable", summary: { notApplicable: 9 } }));
});
