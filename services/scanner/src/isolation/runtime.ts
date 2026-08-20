import { readFileSync, statSync } from "node:fs";

export type RuntimeIsolationEvidence = {
  platform: NodeJS.Platform;
  uid: number | null;
  nonRootExecution: boolean;
  noNewPrivileges: boolean;
  capabilitiesAbsent: boolean;
  sensitiveMountsAbsent: boolean;
  resourceLimits: boolean;
  browserSandboxEnabled: boolean;
};

export function parseProcStatus(status: string): {
  uid: number | null;
  noNewPrivileges: boolean;
  capabilitiesAbsent: boolean;
} {
  const uidLine = status.split("\n").find((line) => line.startsWith("Uid:"));
  const uid = uidLine ? Number(uidLine.trim().split(/\s+/)[1]) : NaN;
  const noNewPrivileges = /^NoNewPrivs:\s+1$/m.test(status);
  const capabilityLine = status.split("\n").find((line) => line.startsWith("CapEff:"));
  const capabilityValue = capabilityLine?.trim().split(/\s+/)[1];
  let capabilitiesAbsent = false;
  if (capabilityValue) {
    try {
      capabilitiesAbsent = BigInt(`0x${capabilityValue}`) === 0n;
    } catch {
      capabilitiesAbsent = false;
    }
  }
  return { uid: Number.isInteger(uid) ? uid : null, noNewPrivileges, capabilitiesAbsent };
}

export function hasBoundedCgroupLimits(files: {
  cpuMax: string;
  memoryMax: string;
  pidsMax: string;
}): boolean {
  const positive = (value: string): boolean => value.trim() !== "max" && Number(value.trim()) > 0;
  const cpu = files.cpuMax.trim().split(/\s+/)[0];
  return cpu !== "max" && Number(cpu) > 0 && positive(files.memoryMax) && positive(files.pidsMax);
}

function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function verifiedMarker(path: string): boolean {
  try {
    const stats = statSync(path);
    return process.platform === "linux" && stats.uid === 0 && (stats.mode & 0o022) === 0 && readFileSync(path, "utf8").trim() === "enabled";
  } catch {
    return false;
  }
}

export function collectRuntimeIsolationEvidence(options: {
  browserSandboxEvidencePath: string;
}): RuntimeIsolationEvidence {
  if (process.platform !== "linux") {
    return {
      platform: process.platform,
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      nonRootExecution: false,
      noNewPrivileges: false,
      capabilitiesAbsent: false,
      sensitiveMountsAbsent: false,
      resourceLimits: false,
      browserSandboxEnabled: false,
    };
  }

  const status = parseProcStatus(readOptional("/proc/self/status") ?? "");
  const mounts = readOptional("/proc/self/mountinfo");
  const sensitiveMountsAbsent = mounts !== undefined && !/(docker\.sock|podman\.sock|\/var\/lib\/docker|\/run\/docker|\/run\/podman)/i.test(mounts);
  const cpuMax = readOptional("/sys/fs/cgroup/cpu.max");
  const memoryMax = readOptional("/sys/fs/cgroup/memory.max");
  const pidsMax = readOptional("/sys/fs/cgroup/pids.max");
  const resourceLimits = Boolean(cpuMax && memoryMax && pidsMax) && hasBoundedCgroupLimits({ cpuMax: cpuMax ?? "", memoryMax: memoryMax ?? "", pidsMax: pidsMax ?? "" });
  return {
    platform: process.platform,
    uid: status.uid,
    nonRootExecution: status.uid !== null && status.uid !== 0,
    noNewPrivileges: status.noNewPrivileges,
    capabilitiesAbsent: status.capabilitiesAbsent,
    sensitiveMountsAbsent,
    resourceLimits,
    browserSandboxEnabled: verifiedMarker(options.browserSandboxEvidencePath),
  };
}
