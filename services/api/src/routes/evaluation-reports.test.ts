import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AccessibilityEvaluationResponse, ControlledQaEvaluationResponse, SeoEvaluationResponse } from "@siteprobe/contracts";
import { buildApp } from "../app.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";

const scannerRunId = randomUUID();
const requestedUrl = "http://fixture.invalid/";
const finalUrl = requestedUrl;
const scannedAt = "2026-08-22T00:00:00.000Z";
const provenance = "controlled-fixture" as const;

const qa: ControlledQaEvaluationResponse = {
  id: randomUUID(), source: "controlled-scanner", provenance, schemaVersion: 1, evaluatorVersion: 1, scannerRunId, requestedUrl, finalUrl, scannedAt, createdAt: scannedAt,
  evaluation: {
    findings: [
      { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "passed", severity: "info", title: "Navigation completed", description: "ok", evidence: { kind: "navigation", navigationSucceeded: true, failureCode: null, requestedUrl, finalUrl, navigationDurationMs: 1 } },
      { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "passed", severity: "info", title: "HTTP status acceptable", description: "ok", evidence: { kind: "httpStatus", value: 200 } },
      { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "failed", severity: "warning", title: "Document title present", description: "The document does not contain a non-empty title.", evidence: { kind: "title", present: false, characterCount: 0 } },
      { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No console errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No page errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "passed", severity: "info", title: "No failed requests", description: "ok", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
    ],
    summary: { critical: 0, warnings: 1, passed: 5, notApplicable: 0 },
  },
};

const accessibility: AccessibilityEvaluationResponse = {
  id: randomUUID(), source: "controlled-scanner", provenance, schemaVersion: 1, evaluatorVersion: 1, scannerRunId, requestedUrl, finalUrl, scannedAt, createdAt: scannedAt, engine: "axe-core", engineVersion: "4.13.0", adapter: "@axe-core/playwright", adapterVersion: "4.13.0", rulesetTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  evaluation: { status: "completed", summary: { violationRules: 1, violationNodes: 2, critical: 0, serious: 1, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 1, needsReviewNodes: 3 }, violations: [{ ruleId: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds", affectedNodeCount: 2, affectedNodeCountCapped: false, samples: [], samplesTruncated: false }], needsReview: [{ ruleId: "landmark", impact: null, help: "All page content should be contained by landmarks", affectedNodeCount: 3, affectedNodeCountCapped: false, samples: [], samplesTruncated: false }], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false },
};

const seoFindings = [
  ["SEO_TITLE_PRESENT", "passed"], ["SEO_TITLE_LENGTH", "failed"], ["SEO_META_DESCRIPTION_PRESENT", "passed"], ["SEO_META_DESCRIPTION_LENGTH", "failed"], ["SEO_CANONICAL_PRESENT", "failed"], ["SEO_HTML_LANG_PRESENT", "passed"], ["SEO_VIEWPORT_PRESENT", "passed"], ["SEO_SINGLE_H1", "passed"], ["SEO_IMAGES_HAVE_ALT", "failed"],
] as const;
const seo: SeoEvaluationResponse = {
  id: randomUUID(), source: "controlled-scanner", provenance, schemaVersion: 1, evaluatorVersion: 1, scannerRunId, requestedUrl, finalUrl, scannedAt, createdAt: scannedAt,
  evaluation: { status: "completed", summary: { passed: 5, warnings: 4, notApplicable: 0 }, findings: seoFindings.map(([ruleId, status]) => ({ ruleId, status, severity: status === "failed" ? "warning" : "info", description: status === "failed" ? `${ruleId} needs attention.` : `${ruleId} passed.`, evidence: ruleId.includes("TITLE") ? { kind: "title", present: true, value: "Fixture", characterCount: 7, truncated: false } : ruleId.includes("DESCRIPTION") ? { kind: "description", present: true, value: "Fixture description", characterCount: 19, truncated: false } : ruleId === "SEO_CANONICAL_PRESENT" ? { kind: "canonical", present: false, value: null, truncated: false } : ruleId === "SEO_HTML_LANG_PRESENT" ? { kind: "htmlLang", present: true, value: "en", truncated: false } : ruleId === "SEO_VIEWPORT_PRESENT" ? { kind: "viewport", present: true, value: "width=device-width", truncated: false } : ruleId === "SEO_SINGLE_H1" ? { kind: "headings", h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } : { kind: "images", imageCount: 1, missingAltCount: status === "failed" ? 1 : 0, samples: [], samplesTruncated: false } })) as never },
};

function repositories(values: { qa?: ControlledQaEvaluationResponse; accessibility?: AccessibilityEvaluationResponse; seo?: SeoEvaluationResponse }) {
  const qaRepository = { create: vi.fn(), findById: vi.fn((id: string) => values.qa?.id === id ? values.qa : undefined), findByScannerRun: vi.fn((id: string) => values.qa?.scannerRunId === id ? values.qa : undefined), list: vi.fn() } as unknown as QaEvaluationRepository;
  const accessibilityRepository = { create: vi.fn(), findById: vi.fn((id: string) => values.accessibility?.id === id ? values.accessibility : undefined), findByScannerRun: vi.fn((id: string) => values.accessibility?.scannerRunId === id ? values.accessibility : undefined), list: vi.fn() } as unknown as AccessibilityEvaluationRepository;
  const seoRepository = { create: vi.fn(), findById: vi.fn((id: string) => values.seo?.id === id ? values.seo : undefined), findByScannerRun: vi.fn((id: string) => values.seo?.scannerRunId === id ? values.seo : undefined), list: vi.fn() } as unknown as SeoEvaluationRepository;
  return { qaRepository, accessibilityRepository, seoRepository };
}

describe("unified evaluation report route", () => {
  it("resolves from each public evaluation ID and aggregates bounded attention items", async () => {
    const repos = repositories({ qa, accessibility, seo });
    const app = buildApp({ logger: false, qaEvaluationRepository: repos.qaRepository, accessibilityEvaluationRepository: repos.accessibilityRepository, seoEvaluationRepository: repos.seoRepository, qaEvaluationPublicReadEnabled: true, accessibilityEvaluationPublicReadEnabled: true, seoEvaluationPublicReadEnabled: true });
    for (const id of [qa.id, accessibility.id, seo.id]) {
      const response = await app.inject({ method: "GET", url: `/api/evaluation-reports/${id}` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ anchorEvaluationId: id, provenance, requestedUrl, finalUrl, qa: { available: true, evaluationId: qa.id }, accessibility: { available: true, evaluationId: accessibility.id }, seo: { available: true, evaluationId: seo.id } });
      expect(response.json()).not.toHaveProperty("scannerRunId");
      expect(response.json()).not.toHaveProperty("qa.evaluation");
    }
    const report = (await app.inject({ method: "GET", url: `/api/evaluation-reports/${qa.id}` })).json();
    expect(report.attentionItems).toHaveLength(7);
    expect(report.attentionItems.filter((item: { source: string }) => item.source === "qa")).toHaveLength(1);
    expect(report.attentionItems.filter((item: { source: string }) => item.source === "accessibility")).toHaveLength(2);
    expect(report.attentionItems.filter((item: { source: string }) => item.source === "seo")).toHaveLength(4);
    await app.close();
  });

  it("returns safe partial reports and respects disabled domains", async () => {
    const repos = repositories({ qa, accessibility, seo });
    const app = buildApp({ logger: false, qaEvaluationRepository: repos.qaRepository, accessibilityEvaluationRepository: repos.accessibilityRepository, seoEvaluationRepository: repos.seoRepository, qaEvaluationPublicReadEnabled: true, accessibilityEvaluationPublicReadEnabled: true, seoEvaluationPublicReadEnabled: false });
    const response = await app.inject({ method: "GET", url: `/api/evaluation-reports/${qa.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().qa.available).toBe(true);
    expect(response.json().accessibility.available).toBe(true);
    expect(response.json().seo).toEqual({ available: false, reason: "public-access-disabled" });
    expect(response.json().attentionItems.every((item: { source: string }) => item.source !== "seo")).toBe(true);
    await app.close();

    const missing = repositories({ qa });
    const partialApp = buildApp({ logger: false, qaEvaluationRepository: missing.qaRepository, accessibilityEvaluationRepository: missing.accessibilityRepository, seoEvaluationRepository: missing.seoRepository, qaEvaluationPublicReadEnabled: true, accessibilityEvaluationPublicReadEnabled: true, seoEvaluationPublicReadEnabled: true });
    const partial = await partialApp.inject({ method: "GET", url: `/api/evaluation-reports/${qa.id}` });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().accessibility).toEqual({ available: false, reason: "not-produced" });
    expect(partial.json().seo).toEqual({ available: false, reason: "not-produced" });
    await partialApp.close();
  });

  it("returns 404 for unknown IDs, disabled-only anchors, and inconsistent related targets", async () => {
    const repos = repositories({ qa, accessibility, seo: { ...seo, requestedUrl: "http://fixture.invalid/other" } });
    const app = buildApp({ logger: false, qaEvaluationRepository: repos.qaRepository, accessibilityEvaluationRepository: repos.accessibilityRepository, seoEvaluationRepository: repos.seoRepository, qaEvaluationPublicReadEnabled: true, accessibilityEvaluationPublicReadEnabled: true, seoEvaluationPublicReadEnabled: false });
    expect((await app.inject({ method: "GET", url: "/api/evaluation-reports/not-a-uuid" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/evaluation-reports/${seo.id}` })).statusCode).toBe(404);
    const report = await app.inject({ method: "GET", url: `/api/evaluation-reports/${qa.id}` });
    expect(report.statusCode).toBe(200);
    expect(report.json().seo.available).toBe(false);
    await app.close();
  });
});
