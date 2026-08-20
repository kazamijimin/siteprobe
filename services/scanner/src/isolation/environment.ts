import type {
  CapabilityStatus,
  IsolationCapabilities,
  IsolationCapabilityName,
} from "./capabilities.js";
import { requiredIsolationCapabilities } from "./capabilities.js";

const capabilityEnvironmentKeys: Record<IsolationCapabilityName, string> = {
  networkIsolation: "SCANNER_CAP_NETWORK_ISOLATION",
  privateNetworkBlocked: "SCANNER_CAP_PRIVATE_NETWORK_BLOCKED",
  metadataBlocked: "SCANNER_CAP_METADATA_BLOCKED",
  databaseNetworkBlocked: "SCANNER_CAP_DATABASE_NETWORK_BLOCKED",
  hostNetworkBlocked: "SCANNER_CAP_HOST_NETWORK_BLOCKED",
  nonRootExecution: "SCANNER_CAP_NON_ROOT_EXECUTION",
  browserSandboxEnabled: "SCANNER_CAP_BROWSER_SANDBOX_ENABLED",
  sensitiveMountsAbsent: "SCANNER_CAP_SENSITIVE_MOUNTS_ABSENT",
  resourceLimits: "SCANNER_CAP_RESOURCE_LIMITS",
};

const validStatuses = new Set<CapabilityStatus>([
  "verified",
  "declared",
  "not-verified",
]);

export function readIsolationCapabilities(
  environment: NodeJS.ProcessEnv,
): IsolationCapabilities {
  const capabilities = {} as IsolationCapabilities;
  for (const name of requiredIsolationCapabilities) {
    const key = capabilityEnvironmentKeys[name];
    const value = (environment[key] ?? "not-verified").trim().toLowerCase() as CapabilityStatus;
    if (!validStatuses.has(value)) {
      throw new Error(`${key} must be verified, declared, or not-verified`);
    }
    capabilities[name] = value;
  }
  return capabilities;
}

export { capabilityEnvironmentKeys };
