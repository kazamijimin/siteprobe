import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runControlledAccessibilityFixture } from "./run-controlled-accessibility-fixture.js";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "../testing/fixtures.js";
import { runScanWithPageInspector } from "../scan/run-scan.js";
import { collectAccessibility } from "../accessibility/collect-accessibility.js";

describe("controlled accessibility fixture execution", () => {
  it("finds no violations on the clean fixture", async () => {
    const result = await runControlledAccessibilityFixture("accessibility-clean");
    expect(result.accessibility.status).toBe("completed");
    if (result.accessibility.status !== "completed") return;
    expect(result.accessibility.evaluation.summary.violationRules).toBe(0);
    expect(result.accessibility.evaluation.needsReview).toHaveLength(0);
  }, 20_000);

  it("finds the image-alt violation", async () => {
    const result = await runControlledAccessibilityFixture("accessibility-missing-alt");
    expect(result.accessibility.status).toBe("completed");
    if (result.accessibility.status !== "completed") return;
    expect(result.accessibility.evaluation.violations.map((item) => item.ruleId)).toContain("image-alt");
    expect(result.accessibility.evaluation.violations.find((item) => item.ruleId === "image-alt")?.impact).toBe("critical");
  }, 20_000);

  it("normalizes mixed impacts and exercises node sample truncation", async () => {
    const result = await runControlledAccessibilityFixture("accessibility-mixed");
    expect(result.accessibility.status).toBe("completed");
    if (result.accessibility.status !== "completed") return;
    const rules = result.accessibility.evaluation.violations;
    expect(rules.map((item) => item.ruleId)).toEqual(expect.arrayContaining(["image-alt", "html-has-lang", "label"]));
    expect(result.accessibility.evaluation.summary.critical).toBeGreaterThan(0);
    expect(result.accessibility.evaluation.summary.serious).toBeGreaterThan(0);
    const imageAlt = rules.find((item) => item.ruleId === "image-alt");
    expect(imageAlt?.affectedNodeCount).toBe(5);
    expect(imageAlt?.samples).toHaveLength(3);
    expect(imageAlt?.samplesTruncated).toBe(true);
  }, 20_000);

  it("does not invoke axe when navigation fails", async () => {
    const result = await runControlledAccessibilityFixture("accessibility-navigation-timeout");
    expect(result.scannerResult.navigationSucceeded).toBe(false);
    expect(result.accessibility).toMatchObject({ status: "notApplicable", reason: "navigationFailed" });
  }, 20_000);

  it("runs axe on the loaded page without additional network requests", async () => {
    let before = -1;
    let after = -1;
    const run = await runScanWithPageInspector(
      { scanId: randomUUID(), url: new URL("/accessibility-clean", FIXTURE_URL).toString() },
      ({ page, state, policy }) => {
        before = state.requestCount;
        return collectAccessibility(page, state, policy).then((value) => { after = state.requestCount; return value; });
      },
      { resolver: fixtureResolver, testOnlyRouteHandler: fixtureRouteHandler },
    );
    expect(run.inspection).toMatchObject({ status: "completed" });
    expect(after).toBe(before);
  }, 20_000);
});
