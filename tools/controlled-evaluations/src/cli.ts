import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { controlledFixtureIdSchema, listControlledFixtureIds } from "@siteprobe/scanner";
import { loadToolConfig, type ControlledEvaluationToolConfig } from "./config.js";
import { ControlledEvaluationError } from "./errors.js";
import { runControlledEvaluationWorkflow, type ControlledEvaluationWorkflowResult } from "./workflow.js";

if (existsSync(".env")) {
  try {
    loadEnvFile(".env");
  } catch {
    // Configuration validation reports a safe error without exposing file contents.
  }
}

export type CliOutput = {
  write: (value: string) => void;
  error: (value: string) => void;
};

export type CliDependencies = {
  loadConfig?: () => ControlledEvaluationToolConfig;
  runWorkflow?: (config: ControlledEvaluationToolConfig, fixtureId: string) => Promise<ControlledEvaluationWorkflowResult>;
};

const defaultOutput: CliOutput = {
  write: (value) => process.stdout.write(value),
  error: (value) => process.stderr.write(value),
};

function printFixtureIds(output: CliOutput): void {
  output.write(`${listControlledFixtureIds().join("\n")}\n`);
}

function printUsageError(output: CliOutput, value: string): void {
  output.error(`Unknown controlled fixture "${value}".\nAvailable controlled fixtures:\n`);
  printFixtureIds(output);
}

function printSuccess(output: CliOutput, result: ControlledEvaluationWorkflowResult): void {
  const summary = result.evaluation.summary;
  output.write([
    `Controlled fixture: ${result.fixtureId}`,
    `Scanner run ID: ${result.scannerResult.scanId}`,
    `Evaluation ID: ${result.persistedEvaluation.id}`,
    "Summary:",
    `  Critical: ${summary.critical}`,
    `  Warnings: ${summary.warnings}`,
    `  Passed: ${summary.passed}`,
    `  Not applicable: ${summary.notApplicable}`,
    "View:",
    `  /qa-evaluations/${result.persistedEvaluation.id}`,
    "",
  ].join("\n"));
}

function printFailure(output: CliOutput, fixtureId: string | undefined, error: unknown): void {
  const controlledError = error instanceof ControlledEvaluationError
    ? error
    : new ControlledEvaluationError("FIXTURE_EXECUTION_FAILURE", "Controlled fixture workflow failed");
  const fixturePart = fixtureId ? ` for "${fixtureId}"` : "";
  output.error(`P7 workflow failed [${controlledError.stage}]${fixturePart}: ${controlledError.message}\n`);
  if (controlledError.safeCode) output.error(`API error code: ${controlledError.safeCode}\n`);
  if (controlledError.statusCode) output.error(`HTTP status: ${controlledError.statusCode}\n`);
  if (controlledError.scannerRunId) output.error(`Scanner run ID: ${controlledError.scannerRunId}\n`);
}

export async function runCli(
  args: readonly string[],
  output: CliOutput = defaultOutput,
  dependencies: CliDependencies = {},
): Promise<number> {
  if (args.length === 1 && args[0] === "--list") {
    printFixtureIds(output);
    return 0;
  }
  if (args.length !== 1 || args[0].startsWith("--")) {
    printUsageError(output, args[0] ?? "");
    return 2;
  }

  const fixtureId = args[0];
  if (!controlledFixtureIdSchema.safeParse(fixtureId).success) {
    printUsageError(output, fixtureId);
    return 2;
  }

  let config: ControlledEvaluationToolConfig;
  try {
    config = (dependencies.loadConfig ?? loadToolConfig)();
  } catch (error) {
    printFailure(output, fixtureId, error);
    return 2;
  }

  try {
    const result = await (dependencies.runWorkflow ?? runControlledEvaluationWorkflow)(config, fixtureId);
    printSuccess(output, result);
    return 0;
  } catch (error) {
    printFailure(output, fixtureId, error);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runCli(process.argv.slice(2));
}
