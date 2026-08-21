import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { listSeoFixtureIds, seoFixtureIdSchema } from "@siteprobe/scanner";
import { loadToolConfig, type ControlledEvaluationToolConfig } from "./config.js";
import { ControlledEvaluationError } from "./errors.js";
import { runControlledSeoWorkflow, type ControlledSeoWorkflowResult } from "./seo-workflow.js";
if (existsSync(".env")) { try { loadEnvFile(".env"); } catch { /* safe configuration error below */ } }
export type SeoCliOutput = { write: (value: string) => void; error: (value: string) => void };
export type SeoCliDependencies = { loadConfig?: () => ControlledEvaluationToolConfig; runWorkflow?: (config: ControlledEvaluationToolConfig, fixtureId: string) => Promise<ControlledSeoWorkflowResult> };
const output: SeoCliOutput = { write: (value) => process.stdout.write(value), error: (value) => process.stderr.write(value) };
function list(out: SeoCliOutput) { out.write(`${listSeoFixtureIds().join("\n")}\n`); }
export async function runSeoCli(args: readonly string[], out: SeoCliOutput = output, deps: SeoCliDependencies = {}): Promise<number> { if (args.length === 1 && args[0] === "--list") { list(out); return 0; } if (args.length !== 1 || !seoFixtureIdSchema.safeParse(args[0]).success) { out.error(`Unknown controlled SEO fixture "${args[0] ?? ""}".\nAvailable controlled SEO fixtures:\n`); list(out); return 2; } let config: ControlledEvaluationToolConfig; try { config = (deps.loadConfig ?? loadToolConfig)(); } catch (error) { out.error(`P12 workflow failed [INVALID_CONFIGURATION]: ${error instanceof Error ? error.message : "Invalid configuration"}\n`); return 2; } try { const result = await (deps.runWorkflow ?? runControlledSeoWorkflow)(config, args[0]!); out.write(["Controlled SEO fixture", `Scanner run ID: ${result.scannerResult.scanId}`, `QA evaluation ID: ${result.persistedEvaluation.id}`, `SEO evaluation ID: ${result.persistedSeoEvaluation.id}`, "SEO summary:", `Passed: ${result.seo.summary.passed}`, `Warnings: ${result.seo.summary.warnings}`, `Not applicable: ${result.seo.summary.notApplicable}`, ""].join("\n")); return 0; } catch (error) { const e = error instanceof ControlledEvaluationError ? error : new ControlledEvaluationError("FIXTURE_EXECUTION_FAILURE", "Controlled SEO workflow failed"); out.error(`P12 workflow failed [${e.stage}] for "${args[0]}": ${e.message}\n`); if (e.safeCode) out.error(`Safe code: ${e.safeCode}\n`); if (e.scannerRunId) out.error(`Scanner run ID: ${e.scannerRunId}\n`); return 1; } }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await runSeoCli(process.argv.slice(2));
