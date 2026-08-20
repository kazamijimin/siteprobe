import { describe, expect, it } from "vitest";

import { requiredIsolationCapabilities, type IsolationCapabilities } from "./capabilities.js";
import { IsolationGate } from "./gate.js";

function capabilities(status: "verified" | "declared" | "not-verified"): IsolationCapabilities {
  return Object.fromEntries(requiredIsolationCapabilities.map((name) => [name, status])) as IsolationCapabilities;
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
    expect(gate.readiness("isolated")).toEqual({ ready: false, reason: "NETWORK_ISOLATION_UNVERIFIED" });
  });

  it("accepts verified or deployment-declared capabilities for isolated readiness", () => {
    expect(new IsolationGate(capabilities("verified")).canExecute("isolated")).toBe(true);
    expect(new IsolationGate(capabilities("declared")).canExecute("isolated")).toBe(true);
  });
});
