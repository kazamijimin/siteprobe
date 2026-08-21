import { describe, expect, it } from "vitest";
import { seoEvaluationSchema, seoRuleIdSchema } from "./seo-evaluation.js";

function completed() {
  const evidence = { kind: "title" as const, present: true, value: "A deterministic SEO title with enough length", characterCount: 45, truncated: false };
  const ids = seoRuleIdSchema.options;
  const kinds = [evidence, evidence, { kind: "description" as const, present: true, value: "A deterministic description that is long enough to exercise the SEO metadata contract without relying on external content.", characterCount: 118, truncated: false }, { kind: "description" as const, present: true, value: "A deterministic description that is long enough to exercise the SEO metadata contract without relying on external content.", characterCount: 118, truncated: false }, { kind: "canonical" as const, present: true, value: "http://fixture.invalid/", truncated: false }, { kind: "htmlLang" as const, present: true, value: "en", truncated: false }, { kind: "viewport" as const, present: true, value: "width=device-width", truncated: false }, { kind: "headings" as const, h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }, { kind: "images" as const, imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false }];
  return { status: "completed" as const, summary: { passed: 9, warnings: 0, notApplicable: 0 }, findings: ids.map((ruleId, index) => ({ ruleId, status: "passed" as const, severity: "info" as const, description: "ok", evidence: kinds[index] })) };
}

describe("SEO evaluation contract", () => {
  it("requires canonical rule order and derived summary", () => expect(seoEvaluationSchema.parse(completed()).findings.map((finding) => finding.ruleId)).toEqual([...seoRuleIdSchema.options]));
  it("represents navigation failure as nine not-applicable rules", () => {
    const findings = seoRuleIdSchema.options.map((ruleId) => ({ ruleId, status: "notApplicable" as const, severity: "info" as const, description: "navigation failed", evidence: ruleId.includes("TITLE") ? { kind: "title" as const, present: false, value: null, characterCount: 0, truncated: false } : ruleId.includes("DESCRIPTION") ? { kind: "description" as const, present: false, value: null, characterCount: 0, truncated: false } : ruleId === "SEO_CANONICAL_PRESENT" ? { kind: "canonical" as const, present: false, value: null, truncated: false } : ruleId === "SEO_HTML_LANG_PRESENT" ? { kind: "htmlLang" as const, present: false, value: null, truncated: false } : ruleId === "SEO_VIEWPORT_PRESENT" ? { kind: "viewport" as const, present: false, value: null, truncated: false } : ruleId === "SEO_SINGLE_H1" ? { kind: "headings" as const, h1Count: 0, headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } : { kind: "images" as const, imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false } }));
    expect(seoEvaluationSchema.parse({ status: "notApplicable", reason: "navigationFailed", summary: { passed: 0, warnings: 0, notApplicable: 9 }, findings }).summary.notApplicable).toBe(9);
  });
});
