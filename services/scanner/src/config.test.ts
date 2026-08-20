import { describe, expect, it } from "vitest";

import { loadScannerConfig } from "./config.js";

const token = "scanner-test-token";

describe("scanner configuration", () => {
  it("requires a server-only internal token", () => {
    expect(() => loadScannerConfig({})).toThrow("SCANNER_INTERNAL_TOKEN is required");
  });

  it("defaults to loopback controlled mode and parses exact hosts", () => {
    expect(
      loadScannerConfig({
        SCANNER_INTERNAL_TOKEN: token,
        SCANNER_CONTROLLED_HOSTS: "Example.com, fixture.invalid, example.com",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 3100,
      internalToken: token,
      executionMode: "controlled",
      controlledHosts: ["example.com", "fixture.invalid"],
    });
  });

  it("accepts isolated mode only as configuration; the gate decides readiness", () => {
    const config = loadScannerConfig({
      SCANNER_INTERNAL_TOKEN: token,
      SCANNER_EXECUTION_MODE: "isolated",
    });
    expect(config.executionMode).toBe("isolated");
    expect(config.isolationCapabilities.networkIsolation).toBe("not-verified");
  });
});
