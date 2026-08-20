import type { ScannerExecutionMode } from "../config.js";
import {
  assessIsolationCapabilities,
  type IsolationAssessment,
  type IsolationCapabilities,
} from "./capabilities.js";

export class IsolationGate {
  readonly assessment: IsolationAssessment;

  constructor(capabilities: IsolationCapabilities) {
    this.assessment = assessIsolationCapabilities(capabilities);
  }

  canExecute(mode: ScannerExecutionMode): boolean {
    return mode === "controlled" || this.assessment.approved;
  }

  readiness(mode: ScannerExecutionMode): {
    ready: boolean;
    reason?: "CONTROLLED_MODE_ONLY" | "NETWORK_ISOLATION_UNVERIFIED";
  } {
    if (mode === "controlled") {
      return { ready: false, reason: "CONTROLLED_MODE_ONLY" };
    }
    return this.assessment.approved
      ? { ready: true }
      : { ready: false, reason: "NETWORK_ISOLATION_UNVERIFIED" };
  }
}
