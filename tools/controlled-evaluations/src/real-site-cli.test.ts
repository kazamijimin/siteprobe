import { describe, expect, it, vi } from "vitest";
import { runRealSiteCli } from "./real-site-cli.js";
import type { RealSiteWorkflowResult } from "./real-site-workflow.js";

const config = { apiUrl: new URL("http://127.0.0.1:3000"), internalToken: "token-must-not-print" };

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { io: { write: (value: string) => stdout.push(value), error: (value: string) => stderr.push(value) }, stdout, stderr };
}

describe("real-site CLI", () => {
  it.each(["https://example.com", "http://127.0.0.1", "https://readirect.org.evil.example", "ftp://readirect.org"])("rejects %s before loading configuration or scanning", async (target) => {
    const result = output();
    const loadConfig = vi.fn();
    const runWorkflow = vi.fn();
    await expect(runRealSiteCli([target], result.io, { loadConfig, runWorkflow })).resolves.toBe(2);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.stderr.join("")).toBeTruthy();
  });

  it("prints bounded success output without the internal token", async () => {
    const result = output();
    const runWorkflow = vi.fn().mockResolvedValue({
      target: "https://readirect.org/",
      scannerResult: { requestedUrl: "https://readirect.org/", finalUrl: "https://readirect.org/", navigationSucceeded: true, httpStatus: 200, navigationDurationMs: 12 },
      evaluation: { summary: { critical: 0, warnings: 1, passed: 5, notApplicable: 0 } },
      persistedEvaluation: { id: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab" },
      accessibility: { status: "completed", evaluation: { summary: { violationRules: 2, needsReviewRules: 1 } } },
      persistedAccessibilityEvaluation: { id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab" },
      seo: { summary: { passed: 7, warnings: 2, notApplicable: 0 } },
      persistedSeoEvaluation: { id: "7d41977d-ffb9-4388-af0a-0f74c8ee64ab" },
    } as unknown as RealSiteWorkflowResult);
    await expect(runRealSiteCli(["https://readirect.org"], result.io, { loadConfig: () => config, runWorkflow })).resolves.toBe(0);
    const text = result.stdout.join("");
    expect(text).toContain("Real-site smoke scan");
    expect(text).toContain("https://readirect.org/");
    expect(text).not.toContain(config.internalToken);
  });
});
