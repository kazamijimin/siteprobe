import { describe, expect, it } from "vitest";

import { evaluateScannerResult } from "./evaluate-scanner-result.js";
import { runScan } from "../scan/run-scan.js";
import {
  FIXTURE_URL,
  fixtureResolver,
  fixtureRouteHandler,
} from "../testing/fixtures.js";

const scanId = "5d41977d-ffb9-4388-af0a-0f74c8ee64ab";

async function runFixture(
  path: string,
  options: Parameters<typeof runScan>[1] = {},
) {
  return runScan(
    { scanId, url: `${FIXTURE_URL.replace(/\/$/, "")}${path}` },
    {
      resolver: fixtureResolver,
      testOnlyRouteHandler: fixtureRouteHandler,
      ...options,
    },
  );
}

function ruleStatus(result: Awaited<ReturnType<typeof runFixture>>, ruleId: string) {
  return evaluateScannerResult(result).findings.find((finding) => finding.ruleId === ruleId);
}

describe("controlled scanner to QA evaluator", () => {
  it("evaluates the healthy fixture as six passed rules", async () => {
    const evaluation = evaluateScannerResult(await runFixture("/"));
    expect(evaluation.findings.every((finding) => finding.status === "passed")).toBe(true);
    expect(evaluation.summary).toEqual({ critical: 0, warnings: 0, passed: 6, notApplicable: 0 });
  });

  it("reports a missing title without making an SEO claim", async () => {
    const result = await runFixture("/missing-title");
    expect(result.navigationSucceeded).toBe(true);
    expect(ruleStatus(result, "DOCUMENT_TITLE_PRESENT")).toMatchObject({
      status: "failed",
      severity: "warning",
    });
  });

  it("reports a controlled 404 as an HTTP warning", async () => {
    const result = await runFixture("/status-404");
    expect(result.httpStatus).toBe(404);
    expect(ruleStatus(result, "HTTP_STATUS_ACCEPTABLE")).toMatchObject({
      status: "failed",
      severity: "warning",
    });
  });

  it("allows a safe controlled redirect", async () => {
    const result = await runFixture("/redirect-ok");
    const evaluation = evaluateScannerResult(result);
    expect(result.navigationSucceeded).toBe(true);
    expect(result.finalUrl).toContain("/redirect-target");
    expect(evaluation.findings[0]).toMatchObject({ status: "passed" });
    expect(evaluation.findings[1]).toMatchObject({ status: "passed" });
    expect(evaluation.findings.some((finding) => finding.status === "failed")).toBe(false);
  });

  it("gates findings when controlled navigation times out", async () => {
    const result = await runFixture("/slow", {
      limits: { navigationTimeoutMs: 100, jobTimeoutMs: 1_500 },
    });
    const evaluation = evaluateScannerResult(result);
    expect(evaluation.findings[0]).toMatchObject({ status: "failed", severity: "critical" });
    expect(evaluation.findings.slice(1).every((finding) => finding.status === "notApplicable")).toBe(true);
  });
});
