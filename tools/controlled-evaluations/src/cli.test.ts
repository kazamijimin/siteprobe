import { describe, expect, it, vi } from "vitest";
import { ControlledEvaluationError } from "./errors.js";
import { runCli } from "./cli.js";

const config = { apiUrl: new URL("http://127.0.0.1:3000"), internalToken: "secret-marker-do-not-print" };

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { io: { write: (value: string) => stdout.push(value), error: (value: string) => stderr.push(value) }, stdout, stderr };
}

describe("controlled fixture CLI", () => {
  it("lists fixtures without configuration, scanner, or API access", async () => {
    const result = output();
    const loadConfig = vi.fn();
    const runWorkflow = vi.fn();
    await expect(runCli(["--list"], result.io, { loadConfig, runWorkflow })).resolves.toBe(0);
    expect(result.stdout.join("")).toContain("healthy\nmissing-title\nstatus-404");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it.each([["https://example.com"], ["http://127.0.0.1"], ["fixture.invalid/foo"], ["/foo"], ["--url"], ["--target"], ["--host"], ["--website"]])(
    "rejects unsafe CLI input %s before loading configuration",
    async (value) => {
      const result = output();
      const loadConfig = vi.fn();
      await expect(runCli([value], result.io, { loadConfig })).resolves.toBe(2);
      expect(loadConfig).not.toHaveBeenCalled();
      expect(result.stderr.join("")).toContain("Unknown controlled fixture");
    },
  );

  it("prints concise success output", async () => {
    const result = output();
    const runWorkflow = vi.fn().mockResolvedValue({
      fixtureId: "healthy",
      scannerResult: { scanId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab" },
      evaluation: { summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 } },
      persistedEvaluation: { id: "6d41977d-ffb9-4388-af0a-0f74c8ee64ab" },
    });
    await expect(runCli(["healthy"], result.io, { loadConfig: () => config, runWorkflow })).resolves.toBe(0);
    expect(result.stdout.join("")).toContain("Evaluation ID: 6d41977d-ffb9-4388-af0a-0f74c8ee64ab");
    expect(result.stdout.join("")).toContain("/qa-evaluations/6d41977d-ffb9-4388-af0a-0f74c8ee64ab");
  });

  it("redacts unexpected errors and returns a nonzero failure code", async () => {
    const result = output();
    const marker = "secret-marker-do-not-print";
    const runWorkflow = vi.fn().mockRejectedValue(new Error(marker));
    await expect(runCli(["healthy"], result.io, { loadConfig: () => config, runWorkflow })).resolves.toBe(1);
    expect(`${result.stdout.join("")}\n${result.stderr.join("")}`).not.toContain(marker);
  });

  it("prints only safe workflow error metadata", async () => {
    const result = output();
    const runWorkflow = vi.fn().mockRejectedValue(new ControlledEvaluationError("INGESTION_AUTH_FAILURE", "Authentication failed", { statusCode: 401, safeCode: "UNAUTHORIZED", scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab" }));
    await expect(runCli(["healthy"], result.io, { loadConfig: () => config, runWorkflow })).resolves.toBe(1);
    expect(result.stderr.join("")).toContain("INGESTION_AUTH_FAILURE");
    expect(result.stderr.join("")).toContain("UNAUTHORIZED");
    expect(result.stderr.join("")).not.toContain(config.internalToken);
  });
});
