import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";
import { InMemoryEvaluationReportHistoryRepository } from "./history.js";

function evaluation(kind: "qa" | "accessibility" | "seo", scannerRunId: string, createdAt: string, provenance: "controlled-fixture" | "real-site-smoke-test" = "controlled-fixture") {
  return {
    id: randomUUID(),
    source: "controlled-scanner" as const,
    provenance,
    scannerRunId,
    requestedUrl: "http://fixture.invalid/",
    finalUrl: "http://fixture.invalid/",
    scannedAt: "2026-08-22T00:00:00.000Z",
    createdAt,
    evaluation: {
      summary: kind === "qa"
        ? { critical: 0, warnings: 0, passed: 6, notApplicable: 0 }
        : kind === "accessibility"
          ? { violationRules: 1, violationNodes: 2, critical: 0, serious: 1, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 1, needsReviewNodes: 3 }
          : { passed: 5, warnings: 4, notApplicable: 0 },
    },
  };
}

function repository(rows: unknown[]) {
  return { list: vi.fn(() => ({ evaluations: rows, nextPosition: null })) };
}

describe("evaluation report history aggregation", () => {
  it("emits one item per correlated scanner run and selects a deterministic anchor", async () => {
    const run = randomUUID();
    const qa = evaluation("qa", run, "2026-08-22T00:00:03.000Z");
    const accessibility = evaluation("accessibility", run, "2026-08-22T00:00:04.000Z");
    const seo = evaluation("seo", run, "2026-08-22T00:00:05.000Z");
    const repositories = { qa: repository([qa]), accessibility: repository([accessibility]), seo: repository([seo]) };
    const history = new InMemoryEvaluationReportHistoryRepository({
      qaRepository: repositories.qa as unknown as QaEvaluationRepository,
      qaPublicReadEnabled: true,
      accessibilityRepository: repositories.accessibility as unknown as AccessibilityEvaluationRepository,
      accessibilityPublicReadEnabled: true,
      seoRepository: repositories.seo as unknown as SeoEvaluationRepository,
      seoPublicReadEnabled: true,
    });
    const page = await history.list({ limit: 20 });
    expect(page.reports).toHaveLength(1);
    expect(page.reports[0]).toMatchObject({ anchorEvaluationId: qa.id, qa: { available: true }, accessibility: { available: true }, seo: { available: true } });
  });

  it("keeps separate runs, filters provenance, and paginates ties stably", async () => {
    const firstRun = randomUUID();
    const secondRun = randomUUID();
    const first = evaluation("qa", firstRun, "2026-08-22T00:00:01.000Z");
    const second = evaluation("qa", secondRun, "2026-08-22T00:00:02.000Z", "real-site-smoke-test");
    const repositories = { qa: repository([first, second]), accessibility: repository([]), seo: repository([]) };
    const history = new InMemoryEvaluationReportHistoryRepository({
      qaRepository: repositories.qa as unknown as QaEvaluationRepository,
      qaPublicReadEnabled: true,
      accessibilityRepository: repositories.accessibility as unknown as AccessibilityEvaluationRepository,
      accessibilityPublicReadEnabled: false,
      seoRepository: repositories.seo as unknown as SeoEvaluationRepository,
      seoPublicReadEnabled: false,
    });
    const firstPage = await history.list({ limit: 1 });
    expect(firstPage.reports).toHaveLength(1);
    expect(firstPage.nextPosition).not.toBeNull();
    const secondPage = await history.list({ limit: 1, before: firstPage.nextPosition! });
    expect(secondPage.reports).toHaveLength(1);
    expect(secondPage.reports[0].anchorEvaluationId).toBe(first.id);
    const filtered = await history.list({ limit: 20, provenance: "real-site-smoke-test" });
    expect(filtered.reports).toHaveLength(1);
    expect(filtered.reports[0].anchorEvaluationId).toBe(second.id);
    expect(filtered.reports[0].accessibility).toEqual({ available: false, reason: "public-access-disabled" });
  });
});
