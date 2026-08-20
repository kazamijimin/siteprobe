import type { ScannerExecutionMode } from "../config.js";
import {
  type IsolationAssessment,
  type IsolationCapabilities,
} from "./capabilities.js";
import type { IsolationEvidence } from "./evidence.js";

export class IsolationGate {
  assessment: IsolationAssessment;
  private readonly evidenceProvider: () => IsolationEvidence;

  constructor(
    capabilities: IsolationCapabilities,
    options: { evidenceProvider?: () => IsolationEvidence } = {},
  ) {
    // SCANNER_CAP_* values are retained for diagnostics only. They are ordinary
    // process-owned environment values and can never establish isolated readiness.
    this.assessment = {
      approved: false,
      missing: [...Object.keys(capabilities) as Array<keyof IsolationCapabilities>],
      capabilities,
    };
    this.evidenceProvider = options.evidenceProvider ?? (() => ({
      attestation: {
        valid: false,
        reason: "ATTESTATION_MISSING",
        checkedAt: new Date().toISOString(),
      },
      runtime: {
        platform: process.platform,
        uid: typeof process.getuid === "function" ? process.getuid() : null,
        nonRootExecution: false,
        noNewPrivileges: false,
        capabilitiesAbsent: false,
        sensitiveMountsAbsent: false,
        resourceLimits: false,
        browserSandboxEnabled: false,
      },
      network: {
        networkIsolation: false,
        privateNetworkBlocked: false,
        metadataBlocked: false,
        databaseNetworkBlocked: false,
        hostNetworkBlocked: false,
        controlledResolverReachable: false,
        egressProxyReachable: false,
        publicCanaryReachable: false,
        protectedCanariesFresh: false,
      },
      internalAuthenticationConfigured: false,
    }));
  }

  canExecute(mode: ScannerExecutionMode): boolean {
    return mode === "controlled" || this.readiness(mode).ready;
  }

  readiness(mode: ScannerExecutionMode): {
    ready: boolean;
    reason?: "CONTROLLED_MODE_ONLY" | "ATTESTATION_INVALID" | "ISOLATION_CHECKS_FAILED";
    checks?: Record<string, boolean>;
    checkedAt?: string;
  } {
    if (mode === "controlled") {
      return { ready: false, reason: "CONTROLLED_MODE_ONLY" };
    }

    const evidence = this.evidenceProvider();
    const checks = {
      attestationValid: evidence.attestation.valid,
      nonRootExecution: evidence.runtime.nonRootExecution,
      noNewPrivileges: evidence.runtime.noNewPrivileges,
      capabilitiesAbsent: evidence.runtime.capabilitiesAbsent,
      sensitiveMountsAbsent: evidence.runtime.sensitiveMountsAbsent,
      resourceLimits: evidence.runtime.resourceLimits,
      browserSandboxEnabled: evidence.runtime.browserSandboxEnabled,
      networkIsolation: evidence.network.networkIsolation,
      privateNetworkBlocked: evidence.network.privateNetworkBlocked,
      metadataBlocked: evidence.network.metadataBlocked,
      databaseNetworkBlocked: evidence.network.databaseNetworkBlocked,
      hostNetworkBlocked: evidence.network.hostNetworkBlocked,
      controlledResolverReachable: evidence.network.controlledResolverReachable,
      egressProxyReachable: evidence.network.egressProxyReachable,
      publicCanaryReachable: evidence.network.publicCanaryReachable,
      protectedCanariesFresh: evidence.network.protectedCanariesFresh,
      internalAuthenticationConfigured: evidence.internalAuthenticationConfigured,
    };
    const missing = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
    this.assessment = {
      approved: missing.length === 0,
      missing: missing as IsolationAssessment["missing"],
      capabilities: this.assessment.capabilities,
    };
    if (missing.length === 0) {
      return { ready: true, checks, checkedAt: evidence.attestation.checkedAt };
    }
    return {
      ready: false,
      reason: evidence.attestation.valid ? "ISOLATION_CHECKS_FAILED" : "ATTESTATION_INVALID",
      checks,
      checkedAt: evidence.attestation.checkedAt,
    };
  }
}
