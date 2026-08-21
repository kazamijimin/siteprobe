import { describe, expect, it } from "vitest";
import type { AccessibilityEvaluationCreate } from "@siteprobe/contracts";
import { InMemoryAccessibilityEvaluationRepository, AccessibilityEvaluationConflictError } from "./repository.js";

function input(overrides: Partial<AccessibilityEvaluationCreate> = {}): AccessibilityEvaluationCreate {
  return {
    schemaVersion: 1,
    evaluatorVersion: 1,
    scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
    requestedUrl: "http://fixture.invalid/accessibility-mixed",
    finalUrl: "http://fixture.invalid/accessibility-mixed",
    scannedAt: "2026-08-21T00:00:00.000Z",
    engine: "axe-core",
    engineVersion: "4.13.0",
    adapter: "@axe-core/playwright",
    adapterVersion: "4.13.0",
    rulesetTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    evaluation: {
      status: "completed",
      summary: {
        violationRules: 1,
        violationNodes: 1,
        critical: 1,
        serious: 0,
        moderate: 0,
        minor: 0,
        unknownImpact: 0,
        needsReviewRules: 0,
        needsReviewNodes: 0,
      },
      violations: [{
        ruleId: "image-alt",
        impact: "critical",
        help: "Images must have alternate text",
        affectedNodeCount: 1,
        affectedNodeCountCapped: false,
        samples: [{ target: ["img"], failureSummary: "Fix any of the following" }],
        samplesTruncated: false,
      }],
      needsReview: [],
      violationsTruncated: false,
      needsReviewTruncated: false,
      countsCapped: false,
      payloadTruncated: false,
    },
    ...overrides,
  };
}

describe("in-memory accessibility evaluation repository", () => {
  it("creates, reads, and retries an identical payload idempotently", async () => {
    const repository = new InMemoryAccessibilityEvaluationRepository();
    const value = input();
    const created = await repository.create(value);
    expect(created.created).toBe(true);
    expect(await repository.findById(created.evaluation.id)).toEqual(created.evaluation);
    expect(await repository.findByScannerRun(value.scannerRunId, 1, "4.13.0")).toEqual(created.evaluation);
    expect(await repository.findByScannerRun(value.scannerRunId, 2, "4.13.0")).toBeUndefined();
    expect(await repository.findByScannerRun("6d41977d-ffb9-4388-af0a-0f74c8ee64ab", 1, "4.13.0")).toBeUndefined();
    expect(await repository.create(structuredClone(value))).toEqual({ evaluation: created.evaluation, created: false });
  });

  it("rejects a different payload for the same run, evaluator, and engine", async () => {
    const repository = new InMemoryAccessibilityEvaluationRepository();
    await repository.create(input());
    expect(() => repository.create(input({ evaluation: {
      ...input().evaluation,
      violations: [{ ...input().evaluation.violations[0], help: "different valid help" }],
    } }))).toThrow(AccessibilityEvaluationConflictError);
  });

  it("keeps engine versions as independent identities", async () => {
    const repository = new InMemoryAccessibilityEvaluationRepository();
    const first = await repository.create(input());
    const second = await repository.create(input({ engineVersion: "4.13.0", scannerRunId: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab" }));
    expect(first.evaluation.id).not.toBe(second.evaluation.id);
  });

  it("lists in created-time/id descending order without duplicate cursor pages", async () => {
    const repository = new InMemoryAccessibilityEvaluationRepository();
    const created = [
      await repository.create(input({ scannerRunId: "7d41977d-ffb9-4388-af0a-0f74c8ee64ab" })),
      await repository.create(input({ scannerRunId: "8d41977d-ffb9-4388-af0a-0f74c8ee64ab" })),
      await repository.create(input({ scannerRunId: "9d41977d-ffb9-4388-af0a-0f74c8ee64ab" })),
    ];
    const first = await repository.list({ limit: 2 });
    expect(first.evaluations).toHaveLength(2);
    expect(first.nextPosition).not.toBeNull();
    const second = await repository.list({ limit: 2, before: first.nextPosition! });
    expect(second.evaluations).toHaveLength(1);
    expect(new Set([...first.evaluations, ...second.evaluations].map((item) => item.id)).size).toBe(3);
    expect(new Set(created.map((item) => item.evaluation.id))).toEqual(new Set([...first.evaluations, ...second.evaluations].map((item) => item.id)));
  });
});
