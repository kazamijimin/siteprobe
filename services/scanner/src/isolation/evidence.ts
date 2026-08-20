import type { ScannerConfig } from "../config.js";
import {
  readAndVerifyDeploymentAttestation,
  type AttestationVerification,
  type DeploymentAttestationChecks,
} from "./attestation.js";
import { collectRuntimeIsolationEvidence, type RuntimeIsolationEvidence } from "./runtime.js";

export type IsolationEvidence = {
  attestation: AttestationVerification;
  runtime: RuntimeIsolationEvidence;
  network: DeploymentAttestationChecks;
  internalAuthenticationConfigured: boolean;
};

const noNetworkEvidence: DeploymentAttestationChecks = {
  networkIsolation: false,
  privateNetworkBlocked: false,
  metadataBlocked: false,
  databaseNetworkBlocked: false,
  hostNetworkBlocked: false,
  controlledResolverReachable: false,
  egressProxyReachable: false,
  publicCanaryReachable: false,
  protectedCanariesFresh: false,
};

export function collectIsolationEvidence(config: Pick<ScannerConfig, "attestationPath" | "attestationPublicKeyPath" | "browserSandboxEvidencePath" | "internalToken" | "egressProxyUrl">): IsolationEvidence {
  const attestation = readAndVerifyDeploymentAttestation({
    attestationPath: config.attestationPath,
    publicKeyPath: config.attestationPublicKeyPath,
  });
  return {
    attestation,
    runtime: collectRuntimeIsolationEvidence({ browserSandboxEvidencePath: config.browserSandboxEvidencePath }),
    network: attestation.valid && attestation.checks
      ? { ...attestation.checks, egressProxyReachable: Boolean(config.egressProxyUrl) && attestation.checks.egressProxyReachable }
      : noNetworkEvidence,
    internalAuthenticationConfigured: config.internalToken.trim().length > 0,
  };
}

export { noNetworkEvidence };
