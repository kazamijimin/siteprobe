import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { buildSeoIngestionPayload } from "@siteprobe/controlled-evaluations";
import { randomUUID } from "node:crypto";
import { seoEvaluationSchema } from "@siteprobe/contracts";

describe("internal SEO evaluation routes", () => {
  it("requires auth, persists idempotently, retrieves internally, and has no public route", async () => {
    const token = "p12-route-test-token"; const app = buildApp({ qaEvaluationInternalToken: token });
    const findings = [
      ["SEO_TITLE_PRESENT", { kind: "title", present: true, value: "title", characterCount: 5, truncated: false }], ["SEO_TITLE_LENGTH", { kind: "title", present: true, value: "title", characterCount: 5, truncated: false }], ["SEO_META_DESCRIPTION_PRESENT", { kind: "description", present: true, value: "description", characterCount: 11, truncated: false }], ["SEO_META_DESCRIPTION_LENGTH", { kind: "description", present: true, value: "description", characterCount: 11, truncated: false }], ["SEO_CANONICAL_PRESENT", { kind: "canonical", present: true, value: "http://fixture.invalid/", truncated: false }], ["SEO_HTML_LANG_PRESENT", { kind: "htmlLang", present: true, value: "en", truncated: false }], ["SEO_VIEWPORT_PRESENT", { kind: "viewport", present: true, value: "width=device-width", truncated: false }], ["SEO_SINGLE_H1", { kind: "headings", h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }], ["SEO_IMAGES_HAVE_ALT", { kind: "images", imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false }],
    ].map(([ruleId, evidence]) => ({ ruleId, status: "passed", severity: "info", description: "ok", evidence }));
    const evaluation = seoEvaluationSchema.parse({ status: "completed", summary: { passed: 9, warnings: 0, notApplicable: 0 }, findings } as never);
    const scannerRunId = randomUUID(); const payload = buildSeoIngestionPayload({ scanId: scannerRunId, requestedUrl: "http://fixture.invalid/seo-clean", finalUrl: "http://fixture.invalid/seo-clean", navigationSucceeded: true, httpStatus: 200, pageTitle: "title", navigationDurationMs: 1, consoleErrors: [], pageErrors: [], failedRequests: [], scannedAt: "2026-08-21T00:00:00.000Z" }, evaluation as never);
    const unauthorized = await app.inject({ method: "POST", url: "/internal/seo-evaluations", payload }); expect(unauthorized.statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/internal/seo-evaluations", headers: { authorization: `Bearer ${token}` }, payload }); expect(created.statusCode).toBe(201); const id = (created.json() as { id: string }).id;
    expect((await app.inject({ method: "POST", url: "/internal/seo-evaluations", headers: { authorization: `Bearer ${token}` }, payload })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/internal/seo-evaluations/${id}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/seo-evaluations" })).statusCode).toBe(404); await app.close();
  });
});
