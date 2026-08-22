import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SeoEvaluationCreate } from "@siteprobe/contracts";
import { buildApp } from "../app.js";
import { InMemorySeoEvaluationRepository, type SeoEvaluationRepository } from "../seo-evaluations/repository.js";

const token = "seo-test-token-which-is-long-enough";

function seoBody(scannerRunId = randomUUID(), requestedUrl = "http://fixture.invalid/seo-clean"): SeoEvaluationCreate {
  const findings: SeoEvaluationCreate["evaluation"] extends { findings: infer F } ? F : never = [
    { ruleId: "SEO_TITLE_PRESENT", status: "passed", severity: "info", description: "The page has a title.", evidence: { kind: "title", present: true, value: "Fixture", characterCount: 7, truncated: false } },
    { ruleId: "SEO_TITLE_LENGTH", status: "passed", severity: "info", description: "The title length is acceptable.", evidence: { kind: "title", present: true, value: "Fixture", characterCount: 7, truncated: false } },
    { ruleId: "SEO_META_DESCRIPTION_PRESENT", status: "passed", severity: "info", description: "The page has a meta description.", evidence: { kind: "description", present: true, value: "A fixture page.", characterCount: 16, truncated: false } },
    { ruleId: "SEO_META_DESCRIPTION_LENGTH", status: "passed", severity: "info", description: "The meta description length is acceptable.", evidence: { kind: "description", present: true, value: "A fixture page.", characterCount: 16, truncated: false } },
    { ruleId: "SEO_CANONICAL_PRESENT", status: "passed", severity: "info", description: "The page has a canonical URL.", evidence: { kind: "canonical", present: true, value: requestedUrl, truncated: false } },
    { ruleId: "SEO_HTML_LANG_PRESENT", status: "passed", severity: "info", description: "The document declares a language.", evidence: { kind: "htmlLang", present: true, value: "en", truncated: false } },
    { ruleId: "SEO_VIEWPORT_PRESENT", status: "passed", severity: "info", description: "The page has a viewport declaration.", evidence: { kind: "viewport", present: true, value: "width=device-width", truncated: false } },
    { ruleId: "SEO_SINGLE_H1", status: "passed", severity: "info", description: "The page has one H1 heading.", evidence: { kind: "headings", h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    { ruleId: "SEO_IMAGES_HAVE_ALT", status: "passed", severity: "info", description: "Images have alternative text.", evidence: { kind: "images", imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false } },
  ];
  return {
    schemaVersion: 1,
    evaluatorVersion: 1,
    scannerRunId,
    provenance: "controlled-fixture",
    requestedUrl,
    finalUrl: requestedUrl,
    scannedAt: "2026-08-20T00:00:00.000Z",
    evaluation: { status: "completed", summary: { passed: 9, warnings: 0, notApplicable: 0 }, findings },
  };
}

function spyRepository(source = new InMemorySeoEvaluationRepository()) {
  return {
    source,
    repository: {
      create: vi.fn(source.create.bind(source)),
      findById: vi.fn(source.findById.bind(source)),
      findByScannerRun: vi.fn(source.findByScannerRun.bind(source)),
      list: vi.fn(source.list.bind(source)),
    } satisfies SeoEvaluationRepository,
  };
}

describe("SEO evaluation routes", () => {
  it("keeps public reads gated while internal persistence remains authenticated", async () => {
    const { repository } = spyRepository();
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, seoEvaluationRepository: repository });
    expect((await app.inject({ method: "GET", url: "/api/seo-evaluations" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/internal/seo-evaluations", payload: seoBody() })).statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/internal/seo-evaluations", headers: { authorization: `Bearer ${token}` }, payload: seoBody() });
    expect(created.statusCode).toBe(201);
    await app.close();
  });

  it("returns a safe public detail projection and gate-aware related IDs", async () => {
    const { source, repository } = spyRepository();
    const created = source.create(seoBody()).evaluation;
    const qaId = randomUUID();
    const accessibilityId = randomUUID();
    const qaRepository = { findByScannerRun: vi.fn().mockReturnValue({ id: qaId }) } as never;
    const accessibilityRepository = { findByScannerRun: vi.fn().mockReturnValue({ id: accessibilityId }) } as never;
    const app = buildApp({ logger: false, seoEvaluationRepository: repository, seoEvaluationPublicReadEnabled: true, qaEvaluationPublicReadEnabled: false });
    const response = await app.inject({ method: "GET", url: `/api/seo-evaluations/${created.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual(expect.objectContaining({ id: created.id, provenance: "controlled-fixture", relatedQaEvaluationId: null, relatedAccessibilityEvaluationId: null }));
    expect(response.json()).not.toHaveProperty("scannerRunId");
    await app.close();

    const paired = buildApp({ logger: false, seoEvaluationRepository: repository, seoEvaluationPublicReadEnabled: true, qaEvaluationRepository: qaRepository, accessibilityEvaluationRepository: accessibilityRepository, qaEvaluationPublicReadEnabled: true, accessibilityEvaluationPublicReadEnabled: true });
    const pairedResponse = await paired.inject({ method: "GET", url: `/api/seo-evaluations/${created.id}` });
    expect(pairedResponse.statusCode).toBe(200);
    expect(pairedResponse.json().relatedQaEvaluationId).toBe(qaId);
    expect(pairedResponse.json().relatedAccessibilityEvaluationId).toBe(accessibilityId);
    await paired.close();
  });

  it("lists newest-first with a bounded cursor and compact summaries", async () => {
    const { source, repository } = spyRepository();
    const first = source.create(seoBody(randomUUID(), "http://fixture.invalid/first")).evaluation;
    const second = source.create(seoBody(randomUUID(), "http://fixture.invalid/second")).evaluation;
    const third = source.create(seoBody(randomUUID(), "http://fixture.invalid/third")).evaluation;
    const app = buildApp({ logger: false, seoEvaluationRepository: repository, seoEvaluationPublicReadEnabled: true });
    const page = await app.inject({ method: "GET", url: "/api/seo-evaluations?limit=2" });
    expect(page.statusCode).toBe(200);
    expect(page.json().evaluations).toHaveLength(2);
    expect(page.json().evaluations[0]).not.toHaveProperty("scannerRunId");
    expect(page.json().evaluations[0]).not.toHaveProperty("finalUrl");
    expect(page.json().evaluations[0].summary).toEqual({ passed: 9, warnings: 0, notApplicable: 0 });
    expect(page.json().nextCursor).toEqual(expect.any(String));
    const next = await app.inject({ method: "GET", url: `/api/seo-evaluations?limit=2&cursor=${page.json().nextCursor}` });
    expect(next.statusCode).toBe(200);
    expect(next.json().evaluations).toHaveLength(1);
    expect([first.id, second.id, third.id]).toContain(next.json().evaluations[0].id);
    await app.close();
  });

  it("validates ids, cursors, and missing rows without reading persistence", async () => {
    const { repository } = spyRepository();
    const app = buildApp({ logger: false, seoEvaluationRepository: repository, seoEvaluationPublicReadEnabled: true });
    expect((await app.inject({ method: "GET", url: "/api/seo-evaluations/not-a-uuid" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/seo-evaluations/${randomUUID()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/seo-evaluations?cursor=not-valid" })).statusCode).toBe(400);
    await app.close();
  });
});
