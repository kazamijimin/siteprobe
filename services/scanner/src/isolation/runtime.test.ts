import { describe, expect, it } from "vitest";

import { hasBoundedCgroupLimits, parseProcStatus } from "./runtime.js";

describe("runtime isolation evidence", () => {
  it("recognizes non-root, no-new-privileges, and empty capabilities", () => {
    const status = parseProcStatus("Uid:\t1001\t1001\t1001\t1001\nCapEff:\t0000000000000000\nNoNewPrivs:\t1\n");
    expect(status).toEqual({ uid: 1001, noNewPrivileges: true, capabilitiesAbsent: true });
  });

  it("requires finite CPU, memory, and PID limits", () => {
    expect(hasBoundedCgroupLimits({ cpuMax: "100000 100000", memoryMax: "536870912", pidsMax: "256" })).toBe(true);
    expect(hasBoundedCgroupLimits({ cpuMax: "max 100000", memoryMax: "536870912", pidsMax: "256" })).toBe(false);
  });
});
