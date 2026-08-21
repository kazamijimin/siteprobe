import { describe, expect, it } from "vitest";
import type { ScannerResult } from "@siteprobe/contracts";

import {
  evaluateScannerResult,
  type QaFinding,
} from "./evaluate-scanner-result.js";

const scanId = "5d41977d-ffb9-4388-af0a-0f74c8ee64ab";

const baseResult: ScannerResult = {
  scanId,
  requestedUrl: "http://fixture.invalid/",
  finalUrl: "http://fixture.invalid/",
  navigationSucceeded: true,
  httpStatus: 200,
  pageTitle: "Fixture Page",
  navigationDurationMs: 12,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  scannedAt: "2026-08-20T00:00:00.000Z",
};

function makeScannerResult(overrides: Partial<ScannerResult> = {}): ScannerResult {
  return { ...baseResult, ...overrides };
}

function finding(result: ScannerResult, ruleId: QaFinding["ruleId"]): QaFinding {
  return evaluateScannerResult(result).findings.find((item) => item.ruleId === ruleId)!;
}

describe("evaluateScannerResult", () => {
  it("evaluates a healthy result in the fixed rule order", () => {
    const evaluation = evaluateScannerResult(makeScannerResult());

    expect(evaluation.findings.map((item) => item.ruleId)).toEqual([
      "NAVIGATION_COMPLETED",
      "HTTP_STATUS_ACCEPTABLE",
      "DOCUMENT_TITLE_PRESENT",
      "NO_CONSOLE_ERRORS",
      "NO_PAGE_ERRORS",
      "NO_FAILED_REQUESTS",
    ]);
    expect(evaluation.findings.every((item) => item.status === "passed")).toBe(true);
    expect(evaluation.findings.every((item) => item.severity === "info")).toBe(true);
    expect(evaluation.summary).toEqual({ critical: 0, warnings: 0, passed: 6, notApplicable: 0 });
    expect("score" in evaluation).toBe(false);
  });

  it.each([
    [100, "warning"],
    [199, "warning"],
    [200, "info"],
    [299, "info"],
    [300, "info"],
    [399, "info"],
    [400, "warning"],
    [404, "warning"],
    [499, "warning"],
    [500, "critical"],
    [599, "critical"],
  ] as const)("classifies HTTP %s", (httpStatus, severity) => {
    const result = finding(makeScannerResult({ httpStatus }), "HTTP_STATUS_ACCEPTABLE");
    expect(result.status).toBe(httpStatus >= 200 && httpStatus <= 399 ? "passed" : "failed");
    expect(result.severity).toBe(severity);
  });

  it("makes a null HTTP status not applicable without gating other rules", () => {
    const evaluation = evaluateScannerResult(makeScannerResult({ httpStatus: null }));
    expect(finding(makeScannerResult({ httpStatus: null }), "HTTP_STATUS_ACCEPTABLE")).toMatchObject({
      status: "notApplicable",
      severity: "info",
      evidence: { kind: "httpStatus", value: null },
    });
    expect(evaluation.summary).toEqual({ critical: 0, warnings: 0, passed: 5, notApplicable: 1 });
  });

  it.each([
    [null, "failed"],
    ["", "failed"],
    ["   ", "failed"],
    ["Fixture Page", "passed"],
  ] as const)("classifies title %j", (pageTitle, status) => {
    const result = finding(makeScannerResult({ pageTitle }), "DOCUMENT_TITLE_PRESENT");
    expect(result.status).toBe(status);
    expect(result.severity).toBe(status === "passed" ? "info" : "warning");
    expect(result.evidence.kind).toBe("title");
  });

  it("does not expose the raw title in evidence", () => {
    const result = finding(makeScannerResult({ pageTitle: "Private title" }), "DOCUMENT_TITLE_PRESENT");
    expect(result.evidence).toEqual({ kind: "title", present: true, characterCount: 13 });
  });

  it("maps console errors to a warning and preserves their recorded count", () => {
    const result = finding(
      makeScannerResult({ consoleErrors: ["first error", "second error"] }),
      "NO_CONSOLE_ERRORS",
    );
    expect(result).toMatchObject({ status: "failed", severity: "warning" });
    expect(result.evidence).toMatchObject({ kind: "messages", recordedCount: 2, samplesTruncated: false });
  });

  it("maps page errors to a critical finding", () => {
    const result = finding(makeScannerResult({ pageErrors: ["uncaught crash"] }), "NO_PAGE_ERRORS");
    expect(result).toMatchObject({ status: "failed", severity: "critical" });
  });

  it("maps failed requests to a warning finding", () => {
    const result = finding(
      makeScannerResult({
        failedRequests: [{
          url: "http://fixture.invalid/fail.js",
          method: "GET",
          resourceType: "script",
          failureReason: "request failed",
        }],
      }),
      "NO_FAILED_REQUESTS",
    );
    expect(result).toMatchObject({ status: "failed", severity: "warning" });
    expect(result.evidence).toMatchObject({ kind: "failedRequests", recordedCount: 1 });
  });

  it("separates scanner policy blocks from target failures", () => {
    const result = finding(makeScannerResult({
      failedRequests: [{
        url: "http://fixture.invalid/rum",
        method: "POST",
        resourceType: "fetch",
        failureReason: "unsafe request method",
        attribution: "SCANNER_POLICY_BLOCK",
      }],
    }), "NO_FAILED_REQUESTS");
    expect(result).toMatchObject({ status: "passed", severity: "info" });
    expect(result.evidence).toMatchObject({ targetFailureCount: 0, scannerPolicyBlockCount: 1 });
  });

  it.each([
    { navigationSucceeded: false },
    { navigationSucceeded: false, failureCode: "NAVIGATION_TIMEOUT" as const },
    { navigationSucceeded: true, failureCode: "REQUEST_LIMIT_EXCEEDED" as const },
  ])("gates downstream rules for incomplete scanner results: %j", (overrides) => {
    const evaluation = evaluateScannerResult(makeScannerResult(overrides));
    expect(evaluation.findings[0]).toMatchObject({ status: "failed", severity: "critical" });
    expect(evaluation.findings.slice(1).every((item) => item.status === "notApplicable")).toBe(true);
    expect(evaluation.findings.slice(1).every((item) => item.severity === "info")).toBe(true);
    expect(evaluation.summary).toEqual({ critical: 1, warnings: 0, passed: 0, notApplicable: 5 });
  });

  it("derives combined warning and critical summary counts", () => {
    const evaluation = evaluateScannerResult(makeScannerResult({
      httpStatus: 500,
      consoleErrors: ["console failure"],
      pageErrors: ["page failure"],
      failedRequests: [{
        url: "http://fixture.invalid/fail.js",
        method: "GET",
        resourceType: "script",
        failureReason: "blocked",
      }],
    }));
    expect(evaluation.summary).toEqual({ critical: 2, warnings: 2, passed: 2, notApplicable: 0 });
  });

  it("bounds message and failed-request evidence to three samples", () => {
    const messages = Array.from({ length: 5 }, (_, index) => `\u0000message-${index}-${"x".repeat(600)}`);
    const failedRequests = Array.from({ length: 5 }, (_, index) => ({
      url: `\u0000http://fixture.invalid/${index}-${"x".repeat(600)}`,
      method: "GET",
      resourceType: "script",
      failureReason: `\u0000reason-${"x".repeat(300)}`,
    }));
    const evaluation = evaluateScannerResult(makeScannerResult({
      consoleErrors: messages,
      failedRequests,
    }));
    const consoleEvidence = finding(makeScannerResult({ consoleErrors: messages }), "NO_CONSOLE_ERRORS").evidence;
    const requestEvidence = finding(makeScannerResult({ failedRequests }), "NO_FAILED_REQUESTS").evidence;

    expect(consoleEvidence).toMatchObject({ recordedCount: 5, samplesTruncated: true });
    expect(consoleEvidence.kind === "messages" && consoleEvidence.samples).toHaveLength(3);
    if (consoleEvidence.kind === "messages") {
      expect(consoleEvidence.samples.every((sample) => sample.length <= 512)).toBe(true);
      expect(consoleEvidence.samples.every((sample) => !/[\u0000-\u001f\u007f]/.test(sample))).toBe(true);
    }
    expect(requestEvidence).toMatchObject({ recordedCount: 5, samplesTruncated: true });
    expect(requestEvidence.kind === "failedRequests" && requestEvidence.samples).toHaveLength(3);
    if (requestEvidence.kind === "failedRequests") {
      expect(requestEvidence.samples.every((sample) => sample.url.length <= 512)).toBe(true);
      expect(requestEvidence.samples.every((sample) => sample.failureReason.length <= 256)).toBe(true);
      expect(requestEvidence.samples.every((sample) => !/[\u0000-\u001f\u007f]/.test(sample.url))).toBe(true);
    }
    expect(evaluation.summary.warnings).toBe(2);
  });

  it("is pure, deterministic, and independent of scannedAt", () => {
    const result = makeScannerResult({ consoleErrors: ["error"] });
    const before = structuredClone(result);
    const first = evaluateScannerResult(result);
    const second = evaluateScannerResult(result);
    const differentTime = evaluateScannerResult({
      ...result,
      scannedAt: "2026-08-21T00:00:00.000Z",
    });

    expect(first).toEqual(second);
    expect(first).toEqual(differentTime);
    expect(result).toEqual(before);
  });
});
