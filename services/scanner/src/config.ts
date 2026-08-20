import { z } from "zod";

const scannerEnvironmentSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
});

export type ScannerConfig = { host: string; port: number };

export function loadScannerConfig(environment: NodeJS.ProcessEnv = process.env): ScannerConfig {
  const parsed = scannerEnvironmentSchema.parse(environment);
  return { host: parsed.HOST, port: parsed.PORT };
}
