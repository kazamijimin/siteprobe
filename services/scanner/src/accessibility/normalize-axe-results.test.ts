import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_MAX_SERIALIZED_BYTES } from "@siteprobe/contracts";
import { normalizeAxeResults } from "./normalize-axe-results.js";

function rule(id: string, impact: string | null, nodeCount = 1, heavy = false) {
  return {
    id,
    impact,
    help: `${id} help`,
    helpUrl: `https://example.invalid/${id}`,
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      html: `<div>${"unsafe".repeat(1000)}</div>`,
      target: heavy ? ["a".repeat(128), "b".repeat(128), "c".repeat(128)] : [`#target-${index}`],
      failureSummary: heavy ? "failure ".repeat(80) : `failure-${index}`,
    })),
  };
}

describe("axe result normalization", () => {
  it("sorts by impact then rule ID and separates incomplete results", () => {
    const result = normalizeAxeResults({
      violations: [rule("label", "critical"), rule("html-has-lang", "serious"), rule("image-alt", "critical"), rule("unknown", null)],
      incomplete: [rule("review-me", "moderate")],
    });
    expect(result.violations.map((item) => item.ruleId)).toEqual(["image-alt", "label", "html-has-lang", "unknown"]);
    expect(result.needsReview.map((item) => item.ruleId)).toEqual(["review-me"]);
    expect(result.summary).toMatchObject({ violationRules: 4, violationNodes: 4, critical: 2, serious: 1, unknownImpact: 1, needsReviewRules: 1 });
    expect(result.violations[0]).not.toHaveProperty("helpUrl");
    expect(result.violations[0]).not.toHaveProperty("html");
  });

  it("bounds samples and the serialized payload with explicit flags", () => {
    const result = normalizeAxeResults({
      violations: Array.from({ length: 25 }, (_, index) => rule(`rule-${index.toString().padStart(2, "0")}`, "critical", 5, true)),
      incomplete: Array.from({ length: 12 }, (_, index) => rule(`review-${index.toString().padStart(2, "0")}`, "moderate", 5, true)),
    });
    expect(result.violations).toHaveLength(20);
    expect(result.needsReview).toHaveLength(10);
    expect(result.violationsTruncated).toBe(true);
    expect(result.needsReviewTruncated).toBe(true);
    expect(result.violations.every((item) => item.samples.length <= 3)).toBe(true);
    expect(result.violations.every((item) => item.samplesTruncated)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(ACCESSIBILITY_MAX_SERIALIZED_BYTES);
    expect(result.payloadTruncated).toBe(true);
  });

  it("rejects malformed engine records without leaking raw content", () => {
    expect(() => normalizeAxeResults({ violations: [{ id: "Bad Rule", impact: "critical", help: "bad", nodes: [] }], incomplete: [] })).toThrow();
    expect(() => normalizeAxeResults({ violations: [{ id: "image-alt", impact: "info", help: "bad", nodes: [] }], incomplete: [] })).toThrow();
  });
});
