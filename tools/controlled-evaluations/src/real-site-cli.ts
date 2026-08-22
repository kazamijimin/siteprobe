import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { parseRealSiteUrl } from "@siteprobe/scanner";
import { loadToolConfig, type ControlledEvaluationToolConfig } from "./config.js";
import { ControlledEvaluationError } from "./errors.js";
import { runRealSiteWorkflow, type RealSiteWorkflowResult } from "./real-site-workflow.js";

for (const envFile of ["tools/controlled-evaluations/.env", ".env"]) {
  if (existsSync(envFile)) {
    try { loadEnvFile(envFile); } catch { /* Configuration validation reports a safe error. */ }
  }
}

export type RealSiteCliOutput = { write: (value: string) => void; error: (value: string) => void };
export type RealSiteCliDependencies = {
  loadConfig?: () => ControlledEvaluationToolConfig;
  runWorkflow?: (config: ControlledEvaluationToolConfig, target: string) => Promise<RealSiteWorkflowResult>;
};

const output: RealSiteCliOutput = { write: (value) => process.stdout.write(value), error: (value) => process.stderr.write(value) };

function printSuccess(out: RealSiteCliOutput, result: RealSiteWorkflowResult): void {
  const core = result.evaluation.summary;
  const accessibility = result.accessibility.status === "completed" ? result.accessibility.evaluation.summary : { violationRules: 0, needsReviewRules: 0 };
  out.write([
    "Real-site smoke scan",
    `Target: ${result.target}`,
    "",
    "Security:",
    "  Allowlist: passed",
    "  URL safety: passed",
    "",
    "Scanner:",
    `  Scanner run ID: ${result.scannerResult.scanId}`,
    "  Navigation: completed",
    `  Requested URL: ${result.scannerResult.requestedUrl}`,
    `  Final URL: ${result.scannerResult.finalUrl ?? "[unavailable]"}`,
    `  HTTP status: ${result.scannerResult.httpStatus ?? "[unavailable]"}`,
    `  Duration: ${result.scannerResult.navigationDurationMs} ms`,
    "",
    "Core QA:",
    `  Evaluation ID: ${result.persistedEvaluation.id}`,
    `  Critical: ${core.critical}`,
    `  Warnings: ${core.warnings}`,
    `  Passed: ${core.passed}`,
    `  Not applicable: ${core.notApplicable}`,
    "",
    "Accessibility:",
    `  Evaluation ID: ${result.persistedAccessibilityEvaluation.id}`,
    `  Violations: ${accessibility.violationRules}`,
    `  Needs review: ${accessibility.needsReviewRules}`,
    "",
    "SEO:",
    `  Evaluation ID: ${result.persistedSeoEvaluation.id}`,
    `  Passed: ${result.seo.summary.passed}`,
    `  Warnings: ${result.seo.summary.warnings}`,
    `  Not applicable: ${result.seo.summary.notApplicable}`,
    "",
    "Views:",
    `  /qa-evaluations/${result.persistedEvaluation.id}`,
    `  /accessibility-evaluations/${result.persistedAccessibilityEvaluation.id}`,
    "",
  ].join("\n"));
}

export async function runRealSiteCli(args: readonly string[], out: RealSiteCliOutput = output, dependencies: RealSiteCliDependencies = {}): Promise<number> {
  if (args.length !== 1) {
    out.error("Usage: pnpm real-scan https://readirect.org\n");
    return 2;
  }
  let target: string;
  try { target = parseRealSiteUrl(args[0]!); }
  catch (error) {
    out.error(`${error instanceof Error ? error.message : "Target host is not allowed by the developer real-site smoke-test policy."}\n`);
    return 2;
  }
  let config: ControlledEvaluationToolConfig;
  try { config = (dependencies.loadConfig ?? loadToolConfig)(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Invalid configuration";
    out.error(`Real-site smoke scan failed [INVALID_CONFIGURATION]: ${message}\n`);
    return 2;
  }
  try {
    printSuccess(out, await (dependencies.runWorkflow ?? runRealSiteWorkflow)(config, target));
    return 0;
  } catch (error) {
    const realSiteError = error instanceof ControlledEvaluationError ? error : new ControlledEvaluationError("REAL_SITE_NAVIGATION_FAILURE", "Real-site smoke scan failed");
    out.error(`Real-site smoke scan failed [${realSiteError.stage}]: ${realSiteError.message}\n`);
    if (realSiteError.safeCode) out.error(`Safe code: ${realSiteError.safeCode}\n`);
    if (realSiteError.scannerRunId) out.error(`Scanner run ID: ${realSiteError.scannerRunId}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await runRealSiteCli(process.argv.slice(2));
