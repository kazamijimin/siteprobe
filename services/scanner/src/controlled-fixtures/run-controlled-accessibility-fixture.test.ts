import { describe, expect, it, vi } from "vitest";
import { accessibilityFixtureIdSchema, listAccessibilityFixtureIds } from "./accessibility-catalog.js";

describe("controlled accessibility fixture catalog", () => {
  it("exposes only the four allowlisted IDs", () => {
    expect(listAccessibilityFixtureIds()).toEqual([
      "accessibility-clean",
      "accessibility-missing-alt",
      "accessibility-mixed",
      "accessibility-navigation-timeout",
    ]);
    expect(accessibilityFixtureIdSchema.safeParse("https://example.com").success).toBe(false);
    expect(accessibilityFixtureIdSchema.safeParse("/accessibility-clean").success).toBe(false);
  });

  it("keeps the accessibility runner importable without arbitrary target parameters", async () => {
    const module = await import("./run-controlled-accessibility-fixture.js");
    expect(module.runControlledAccessibilityFixture).toEqual(expect.any(Function));
    expect(vi.isMockFunction(module.runControlledAccessibilityFixture)).toBe(false);
  });
});
