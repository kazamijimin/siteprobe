import { z } from "zod";
import { readIsolationCapabilities } from "./isolation/environment.js";

export const scannerExecutionModeSchema = z.enum(["controlled", "isolated"]);
export type ScannerExecutionMode = z.infer<typeof scannerExecutionModeSchema>;

const scannerEnvironmentSchema = z.object({
  SCANNER_HOST: z.string().trim().min(1).default("127.0.0.1"),
  SCANNER_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  SCANNER_INTERNAL_TOKEN: z.string().trim().optional(),
  SCANNER_EXECUTION_MODE: scannerExecutionModeSchema.default("controlled"),
  SCANNER_CONTROLLED_HOSTS: z.string().default(""),
  SCANNER_EGRESS_PROXY_URL: z.string().trim().default(""),
  SCANNER_ATTESTATION_PATH: z.string().trim().default("/etc/siteprobe/scanner-attestation.json"),
  SCANNER_ATTESTATION_PUBLIC_KEY_PATH: z.string().trim().default("/etc/siteprobe/scanner-attestation.pub"),
  SCANNER_BROWSER_SANDBOX_EVIDENCE_PATH: z.string().trim().default("/run/siteprobe/chromium-sandbox.verified"),
});

export type ScannerConfig = {
  host: string;
  port: number;
  internalToken: string;
  executionMode: ScannerExecutionMode;
  controlledHosts: readonly string[];
  egressProxyUrl: string;
  attestationPath: string;
  attestationPublicKeyPath: string;
  browserSandboxEvidencePath: string;
  isolationCapabilities: ReturnType<typeof readIsolationCapabilities>;
};

function parseControlledHosts(value: string): string[] {
  return [...new Set(value.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean))];
}

export function loadScannerConfig(environment: NodeJS.ProcessEnv = process.env): ScannerConfig {
  const normalizedEnvironment = {
    ...environment,
    SCANNER_HOST: environment.SCANNER_HOST ?? environment.HOST,
    SCANNER_PORT: environment.SCANNER_PORT ?? environment.PORT,
  };
  const parsed = scannerEnvironmentSchema.parse(normalizedEnvironment);
  if (!parsed.SCANNER_INTERNAL_TOKEN) {
    throw new Error("SCANNER_INTERNAL_TOKEN is required");
  }
  return {
    host: parsed.SCANNER_HOST,
    port: parsed.SCANNER_PORT,
    internalToken: parsed.SCANNER_INTERNAL_TOKEN,
    executionMode: parsed.SCANNER_EXECUTION_MODE,
    controlledHosts: parseControlledHosts(parsed.SCANNER_CONTROLLED_HOSTS),
    egressProxyUrl: parsed.SCANNER_EGRESS_PROXY_URL,
    attestationPath: parsed.SCANNER_ATTESTATION_PATH,
    attestationPublicKeyPath: parsed.SCANNER_ATTESTATION_PUBLIC_KEY_PATH,
    browserSandboxEvidencePath: parsed.SCANNER_BROWSER_SANDBOX_EVIDENCE_PATH,
    isolationCapabilities: readIsolationCapabilities(environment),
  };
}
