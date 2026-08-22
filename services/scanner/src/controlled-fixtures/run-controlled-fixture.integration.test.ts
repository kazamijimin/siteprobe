import { describe, expect, it } from "vitest";
import { evaluateScannerResult } from "../evaluation/evaluate-scanner-result.js";
import { runControlledFixture } from "./run-controlled-fixture.js";

function finding(result: Awaited<ReturnType<typeof runControlledFixture>>, ruleId: string) {
  return evaluateScannerResult(result).findings.find((item) => item.ruleId === ruleId);
}

describe("controlled fixture execution", () => {
  it("runs healthy as six passed findings", async () => {
    const result = await runControlledFixture("healthy");
    expect(evaluateScannerResult(result).summary).toEqual({ critical: 0, warnings: 0, passed: 6, notApplicable: 0 });
  });

  it("runs missing-title as a document warning", async () => {
    const result = await runControlledFixture("missing-title");
    expect(finding(result, "DOCUMENT_TITLE_PRESENT")).toMatchObject({ status: "failed", severity: "warning" });
  });

  it("runs status-404 as an HTTP warning", async () => {
    const result = await runControlledFixture("status-404");
    expect(result.httpStatus).toBe(404);
    expect(finding(result, "HTTP_STATUS_ACCEPTABLE")).toMatchObject({ status: "failed", severity: "warning" });
  });

  it("runs redirect-ok only within the controlled fixture host", async () => {
    const result = await runControlledFixture("redirect-ok");
    expect(result.navigationSucceeded).toBe(true);
    expect(result.finalUrl).toContain("/redirect-target");
    expect(finding(result, "NAVIGATION_COMPLETED")).toMatchObject({ status: "passed" });
  });

  it("runs navigation-timeout as a critical failure with downstream N/A findings", async () => {
    const result = await runControlledFixture("navigation-timeout");
    const evaluation = evaluateScannerResult(result);
    expect(evaluation.findings[0]).toMatchObject({ status: "failed", severity: "critical" });
    expect(evaluation.findings.slice(1).every((item) => item.status === "notApplicable")).toBe(true);
  });

  it("captures bounded console evidence", async () => {
    const result = await runControlledFixture("console-error");
    expect(result.consoleErrors.length).toBeGreaterThan(0);
    expect(finding(result, "NO_CONSOLE_ERRORS")).toMatchObject({ status: "failed", severity: "warning" });
  });

  it("captures bounded failed-request evidence", async () => {
    const result = await runControlledFixture("failed-resource");
    expect(result.failedRequests.length).toBeGreaterThan(0);
    expect(result.failedRequests.every((request) => request.attribution === "TARGET_FAILURE")).toBe(true);
    expect(finding(result, "NO_FAILED_REQUESTS")).toMatchObject({ status: "failed", severity: "warning" });
  });
});
