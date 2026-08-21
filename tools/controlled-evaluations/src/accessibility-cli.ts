import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { listAccessibilityFixtureIds, accessibilityFixtureIdSchema } from "@siteprobe/scanner/controlled-accessibility";
import { loadToolConfig, type ControlledEvaluationToolConfig } from "./config.js";
import { ControlledEvaluationError } from "./errors.js";
import { runControlledAccessibilityWorkflow, type ControlledAccessibilityWorkflowResult } from "./accessibility-workflow.js";

if (existsSync(".env")) { try { loadEnvFile(".env"); } catch { /* safe config error below */ } }
export type AccessibilityCliOutput = { write: (value: string) => void; error: (value: string) => void };
export type AccessibilityCliDependencies = { loadConfig?: () => ControlledEvaluationToolConfig; runWorkflow?: (config: ControlledEvaluationToolConfig, fixtureId: string) => Promise<ControlledAccessibilityWorkflowResult> };
const output: AccessibilityCliOutput = { write: (v) => process.stdout.write(v), error: (v) => process.stderr.write(v) };
function printList(out: AccessibilityCliOutput) { out.write(`${listAccessibilityFixtureIds().join("\n")}\n`); }
function usage(out: AccessibilityCliOutput, value: string) { out.error(`Unknown controlled accessibility fixture "${value}".\nAvailable controlled accessibility fixtures:\n`); printList(out); }
function success(out: AccessibilityCliOutput, result: ControlledAccessibilityWorkflowResult) {
  const a = result.persistedAccessibilityEvaluation;
  const summary = result.accessibility.status === "completed" ? result.accessibility.evaluation.summary : { violationRules: 0, violationNodes: 0, critical: 0, serious: 0, moderate: 0, minor: 0, needsReviewRules: 0 };
  out.write(["Controlled accessibility fixture", `Scanner run ID: ${result.scannerResult.scanId}`, `QA evaluation ID: ${result.persistedEvaluation.id}`, `Accessibility evaluation ID: ${a?.id ?? "unknown"}`, "", "Accessibility summary:", `Violation rules: ${summary.violationRules}`, `Violation nodes: ${summary.violationNodes}`, `Critical: ${summary.critical}`, `Serious: ${summary.serious}`, `Moderate: ${summary.moderate}`, `Minor: ${summary.minor}`, `Needs review: ${summary.needsReviewRules}`, ""].join("\n"));
}
export async function runAccessibilityCli(args: readonly string[], out: AccessibilityCliOutput = output, deps: AccessibilityCliDependencies = {}): Promise<number> {
  if (args.length === 1 && args[0] === "--list") { printList(out); return 0; }
  if (args.length !== 1 || args[0].startsWith("--") || !accessibilityFixtureIdSchema.safeParse(args[0]).success) { usage(out, args[0] ?? ""); return 2; }
  const fixtureId = args[0];
  let config: ControlledEvaluationToolConfig;
  try { config = (deps.loadConfig ?? loadToolConfig)(); } catch (error) { out.error(`P8 workflow failed [INVALID_CONFIGURATION]: ${error instanceof Error ? error.message : "Invalid configuration"}\n`); return 2; }
  try { success(out, await (deps.runWorkflow ?? runControlledAccessibilityWorkflow)(config, fixtureId)); return 0; }
  catch (error) { const e = error instanceof ControlledEvaluationError ? error : new ControlledEvaluationError("FIXTURE_EXECUTION_FAILURE", "Controlled accessibility workflow failed"); out.error(`P8 workflow failed [${e.stage}] for "${fixtureId}": ${e.message}\n`); if (e.safeCode) out.error(`Safe code: ${e.safeCode}\n`); if (e.scannerRunId) out.error(`Scanner run ID: ${e.scannerRunId}\n`); return 1; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await runAccessibilityCli(process.argv.slice(2));
