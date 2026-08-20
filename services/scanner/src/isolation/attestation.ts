import { createPublicKey, verify as verifySignature } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";

export const deploymentAttestationChecksSchema = z.object({
  networkIsolation: z.boolean(),
  privateNetworkBlocked: z.boolean(),
  metadataBlocked: z.boolean(),
  databaseNetworkBlocked: z.boolean(),
  hostNetworkBlocked: z.boolean(),
  controlledResolverReachable: z.boolean(),
  egressProxyReachable: z.boolean(),
  publicCanaryReachable: z.boolean(),
  protectedCanariesFresh: z.boolean(),
});

export type DeploymentAttestationChecks = z.infer<typeof deploymentAttestationChecksSchema>;

const deploymentAttestationPayloadSchema = z.object({
  version: z.literal(1),
  environmentId: z.string().trim().min(1),
  vmId: z.string().trim().min(1),
  firewallPolicySha256: z.string().regex(/^[a-f0-9]{64}$/i),
  proxyPolicySha256: z.string().regex(/^[a-f0-9]{64}$/i),
  resolverPolicySha256: z.string().regex(/^[a-f0-9]{64}$/i),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  controlPlaneIdentity: z.string().trim().min(1),
  checks: deploymentAttestationChecksSchema,
});

export const deploymentAttestationSchema = deploymentAttestationPayloadSchema.extend({
  signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export type DeploymentAttestationPayload = z.infer<typeof deploymentAttestationPayloadSchema>;
export type DeploymentAttestation = z.infer<typeof deploymentAttestationSchema>;

export type AttestationVerification = {
  valid: boolean;
  reason:
    | "ATTESTATION_VALID"
    | "ATTESTATION_MISSING"
    | "ATTESTATION_UNTRUSTED_FILE"
    | "ATTESTATION_INVALID"
    | "ATTESTATION_EXPIRED"
    | "ATTESTATION_NOT_YET_VALID"
    | "ATTESTATION_BAD_SIGNATURE"
    | "ATTESTATION_PLATFORM_UNSUPPORTED";
  checkedAt: string;
  checks?: DeploymentAttestationChecks;
};

const attestationKeys = [
  "version",
  "environmentId",
  "vmId",
  "firewallPolicySha256",
  "proxyPolicySha256",
  "resolverPolicySha256",
  "issuedAt",
  "expiresAt",
  "controlPlaneIdentity",
  "checks",
] as const;

export function canonicalizeAttestationPayload(payload: DeploymentAttestationPayload): string {
  return JSON.stringify(Object.fromEntries(attestationKeys.map((key) => [key, payload[key]])));
}

function result(
  reason: AttestationVerification["reason"],
  now: Date,
  checks?: DeploymentAttestationChecks,
): AttestationVerification {
  return { valid: reason === "ATTESTATION_VALID", reason, checkedAt: now.toISOString(), ...(checks ? { checks } : {}) };
}

export function verifyDeploymentAttestation(
  input: unknown,
  publicKeyPem: string,
  now = new Date(),
  clockSkewMs = 30_000,
): AttestationVerification {
  const parsed = deploymentAttestationSchema.safeParse(input);
  if (!parsed.success) return result("ATTESTATION_INVALID", now);

  const attestation = parsed.data;
  const issuedAt = Date.parse(attestation.issuedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  const nowMs = now.getTime();
  if (issuedAt > nowMs + clockSkewMs) return result("ATTESTATION_NOT_YET_VALID", now, attestation.checks);
  if (expiresAt <= nowMs) return result("ATTESTATION_EXPIRED", now, attestation.checks);

  try {
    const key = createPublicKey(publicKeyPem);
    const valid = verifySignature(
      null,
      Buffer.from(canonicalizeAttestationPayload(attestation), "utf8"),
      key,
      Buffer.from(attestation.signature, "base64"),
    );
    return valid
      ? result("ATTESTATION_VALID", now, attestation.checks)
      : result("ATTESTATION_BAD_SIGNATURE", now, attestation.checks);
  } catch {
    return result("ATTESTATION_BAD_SIGNATURE", now, attestation.checks);
  }
}

function trustedFile(path: string): boolean {
  try {
    const stats = statSync(path);
    if (process.platform !== "linux") return false;
    if (stats.uid !== 0) return false;
    return (stats.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

export function readAndVerifyDeploymentAttestation(options: {
  attestationPath: string;
  publicKeyPath: string;
  now?: Date;
}): AttestationVerification {
  const now = options.now ?? new Date();
  if (process.platform !== "linux") return result("ATTESTATION_PLATFORM_UNSUPPORTED", now);
  if (!trustedFile(options.attestationPath) || !trustedFile(options.publicKeyPath)) {
    return result("ATTESTATION_UNTRUSTED_FILE", now);
  }
  try {
    return verifyDeploymentAttestation(
      JSON.parse(readFileSync(options.attestationPath, "utf8")) as unknown,
      readFileSync(options.publicKeyPath, "utf8"),
      now,
    );
  } catch {
    return result("ATTESTATION_INVALID", now);
  }
}
