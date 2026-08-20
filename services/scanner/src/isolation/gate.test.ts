import { describe, expect, it } from "vitest";

import { requiredIsolationCapabilities, type IsolationCapabilities } from "./capabilities.js";
import type { IsolationEvidence } from "./evidence.js";
import { IsolationGate } from "./gate.js";

function capabilities(status: "verified" | "declared" | "not-verified"): IsolationCapabilities {
  return Object.fromEntries(requiredIsolationCapabilities.map((name) => [name, status])) as IsolationCapabilities;
}

function trustedEvidence(): IsolationEvidence {
  return {
    attestation: {
      valid: true,
      reason: "ATTESTATION_VALID",
      checkedAt: new Date().toISOString(),
      checks: {
        networkIsolation: true,
        privateNetworkBlocked: true,
        metadataBlocked: true,
        databaseNetworkBlocked: true,
        hostNetworkBlocked: true,
        controlledResolverReachable: true,
        egressProxyReachable: true,
        publicCanaryReachable: true,
        protectedCanariesFresh: true,
      },
    },
    runtime: {
      platform: "linux",
      uid: 1001,
      nonRootExecution: true,
      noNewPrivileges: true,
      capabilitiesAbsent: true,
      sensitiveMountsAbsent: true,
      resourceLimits: true,
      browserSandboxEnabled: true,
    },
    network: {
      networkIsolation: true,
      privateNetworkBlocked: true,
      metadataBlocked: true,
      databaseNetworkBlocked: true,
      hostNetworkBlocked: true,
      controlledResolverReachable: true,
      egressProxyReachable: true,
      publicCanaryReachable: true,
      protectedCanariesFresh: true,
    },
    internalAuthenticationConfigured: true,
  };
}

describe("scanner isolation gate", () => {
  it("keeps controlled mode available while reporting not-ready for unrestricted execution", () => {
    const gate = new IsolationGate(capabilities("not-verified"));
    expect(gate.canExecute("controlled")).toBe(true);
    expect(gate.readiness("controlled")).toEqual({ ready: false, reason: "CONTROLLED_MODE_ONLY" });
  });

  it("fails closed for isolated mode until all capabilities are trusted", () => {
    const gate = new IsolationGate(capabilities("not-verified"));
    expect(gate.canExecute("isolated")).toBe(false);
    expect(gate.readiness("isolated")).toMatchObject({ ready: false, reason: "ATTESTATION_INVALID" });
  });

  it("does not trust ordinary environment declarations for isolated readiness", () => {
    expect(new IsolationGate(capabilities("verified")).canExecute("isolated")).toBe(false);
    expect(new IsolationGate(capabilities("declared")).canExecute("isolated")).toBe(false);
  });

  it("requires independently supplied attestation and runtime evidence", () => {
    const gate = new IsolationGate(capabilities("declared"), { evidenceProvider: trustedEvidence });
    expect(gate.canExecute("isolated")).toBe(true);
    expect(gate.readiness("isolated").ready).toBe(true);
  });
});
