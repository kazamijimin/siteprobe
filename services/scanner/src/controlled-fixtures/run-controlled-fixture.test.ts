import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scannerResultSchema } from "@siteprobe/contracts";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "../testing/fixtures.js";
import { controlledFixtureIdSchema, getControlledFixtureDefinition, listControlledFixtureIds } from "./catalog.js";

const runScan = vi.fn();

vi.mock("../scan/run-scan.js", () => ({ runScan }));

const { runControlledFixture } = await import("./run-controlled-fixture.js");

function scannerResult(overrides: Record<string, unknown> = {}) {
  return scannerResultSchema.parse({
    scanId: randomUUID(),
    requestedUrl: FIXTURE_URL,
    finalUrl: FIXTURE_URL,
    navigationSucceeded: true,
    httpStatus: 200,
    pageTitle: "Fixture Page",
    navigationDurationMs: 1,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    scannedAt: new Date().toISOString(),
    ...overrides,
  });
}

describe("controlled fixture catalog", () => {
  beforeEach(() => {
    runScan.mockReset();
    runScan.mockResolvedValue(scannerResult());
  });

  it("accepts only the seven repository-owned IDs", () => {
    expect(listControlledFixtureIds()).toEqual([
      "healthy",
      "missing-title",
      "status-404",
      "redirect-ok",
      "navigation-timeout",
      "console-error",
      "failed-resource",
    ]);
    expect(controlledFixtureIdSchema.safeParse("https://example.com").success).toBe(false);
    expect(controlledFixtureIdSchema.safeParse("fixture.invalid/foo").success).toBe(false);
    expect(controlledFixtureIdSchema.safeParse("/foo").success).toBe(false);
  });

  it("keeps paths and timeout limits owned by the catalog", () => {
    expect(getControlledFixtureDefinition("healthy")).toEqual({ path: "/" });
    expect(getControlledFixtureDefinition("redirect-ok")).toEqual({ path: "/redirect-ok" });
    expect(getControlledFixtureDefinition("navigation-timeout")).toEqual({
      path: "/slow",
      limits: { navigationTimeoutMs: 100, jobTimeoutMs: 1_500 },
    });
  });

  it("rejects an unknown ID before runScan or browser creation", async () => {
    await expect(runControlledFixture("unknown" as never)).rejects.toThrow();
    expect(runScan).not.toHaveBeenCalled();
  });

  it("uses the existing scanner policy and fixture route handler", async () => {
    const result = await runControlledFixture("missing-title");
    expect(result).toEqual(expect.objectContaining({ scanId: expect.any(String) }));
    expect(runScan).toHaveBeenCalledTimes(1);
    expect(runScan).toHaveBeenCalledWith(
      expect.objectContaining({
        scanId: expect.any(String),
        url: "http://fixture.invalid/missing-title",
      }),
      expect.objectContaining({ resolver: fixtureResolver, testOnlyRouteHandler: fixtureRouteHandler }),
    );
  });
});
