import { loadScannerConfig } from "./config.js";
import { buildScannerApp } from "./app.js";
import { runScan } from "./scan/run-scan.js";

const config = loadScannerConfig();
const app = buildScannerApp({
  config,
  logger: true,
  runScan: (input) => runScan(input, {
    proxyServer: config.executionMode === "isolated" ? config.egressProxyUrl : undefined,
  }),
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down scanner worker");
  await app.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
