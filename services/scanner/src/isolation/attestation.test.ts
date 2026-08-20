import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalizeAttestationPayload,
  verifyDeploymentAttestation,
  type DeploymentAttestationPayload,
} from "./attestation.js";

const checks = {
  networkIsolation: true,
  privateNetworkBlocked: true,
  metadataBlocked: true,
  databaseNetworkBlocked: true,
  hostNetworkBlocked: true,
  controlledResolverReachable: true,
  egressProxyReachable: true,
  publicCanaryReachable: true,
  protectedCanariesFresh: true,
};

function signedAttestation(expiresAt = "2026-08-20T21:00:00.000Z") {
  const payload: DeploymentAttestationPayload = {
    version: 1,
    environmentId: "siteprobe-test",
    vmId: "vm-test",
    firewallPolicySha256: "a".repeat(64),
    proxyPolicySha256: "b".repeat(64),
    resolverPolicySha256: "c".repeat(64),
    issuedAt: "2026-08-20T20:00:00.000Z",
    expiresAt,
    controlPlaneIdentity: "api-test",
    checks,
  };
  const keyPair = generateKeyPairSync("ed25519");
  const signature = sign(null, Buffer.from(canonicalizeAttestationPayload(payload)), keyPair.privateKey).toString("base64");
  return {
    input: { ...payload, signature },
    publicKey: keyPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

describe("deployment attestation", () => {
  it("accepts a valid signed, unexpired attestation", () => {
    const attestation = signedAttestation();
    const result = verifyDeploymentAttestation(attestation.input, attestation.publicKey, new Date("2026-08-20T20:30:00.000Z"));
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("ATTESTATION_VALID");
    expect(result.checks?.publicCanaryReachable).toBe(true);
  });

  it("rejects tampering and expiry", () => {
    const attestation = signedAttestation();
    const tampered = { ...attestation.input, vmId: "different-vm" };
    expect(verifyDeploymentAttestation(tampered, attestation.publicKey, new Date("2026-08-20T20:30:00.000Z")).reason).toBe("ATTESTATION_BAD_SIGNATURE");

    const expired = signedAttestation("2026-08-20T20:01:00.000Z");
    expect(verifyDeploymentAttestation(expired.input, expired.publicKey, new Date("2026-08-20T20:30:00.000Z")).reason).toBe("ATTESTATION_EXPIRED");
  });
});
