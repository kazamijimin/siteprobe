export const requiredIsolationCapabilities = [
  "networkIsolation",
  "privateNetworkBlocked",
  "metadataBlocked",
  "databaseNetworkBlocked",
  "hostNetworkBlocked",
  "nonRootExecution",
  "browserSandboxEnabled",
  "sensitiveMountsAbsent",
  "resourceLimits",
] as const;

export type IsolationCapabilityName = (typeof requiredIsolationCapabilities)[number];
export type CapabilityStatus = "verified" | "declared" | "not-verified";
export type IsolationCapabilities = Record<IsolationCapabilityName, CapabilityStatus>;

export type IsolationAssessment = {
  approved: boolean;
  missing: IsolationCapabilityName[];
  capabilities: IsolationCapabilities;
};

export function assessIsolationCapabilities(
  capabilities: IsolationCapabilities,
): IsolationAssessment {
  const missing = requiredIsolationCapabilities.filter(
    (name) => capabilities[name] === "not-verified",
  );
  return { approved: missing.length === 0, missing, capabilities };
}
