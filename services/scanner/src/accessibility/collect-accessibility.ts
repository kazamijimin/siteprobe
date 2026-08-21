import { AxeBuilder } from "@axe-core/playwright";
import {
  AXE_ADAPTER_VERSION,
  AXE_ENGINE_VERSION,
  accessibilityEngineMetadataSchema,
  accessibilityRulesetTags,
  type AccessibilityCompletedEvaluation,
  type AccessibilityEngineMetadata,
} from "@siteprobe/contracts";
import type { Page } from "playwright";
import type { NetworkPolicyState } from "../browser/network-policy.js";
import type { ScannerRunLimits } from "../scan/run-scan.js";
import { normalizeAxeResults } from "./normalize-axe-results.js";

export type AccessibilityCollectionResult =
  | { status: "completed"; engine: AccessibilityEngineMetadata; evaluation: AccessibilityCompletedEvaluation }
  | { status: "failed"; code: "AXE_EXECUTION_FAILED" | "AXE_RESULT_INVALID" };

export const accessibilityEngineMetadata: AccessibilityEngineMetadata = accessibilityEngineMetadataSchema.parse({
  engine: "axe-core",
  engineVersion: AXE_ENGINE_VERSION,
  adapter: "@axe-core/playwright",
  adapterVersion: AXE_ADAPTER_VERSION,
  rulesetTags: accessibilityRulesetTags,
});

export async function collectAccessibility(
  page: Page,
  state: NetworkPolicyState,
  policy: ScannerRunLimits,
): Promise<AccessibilityCollectionResult> {
  const requestCountBefore = state.requestCount;
  let raw: unknown;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("Accessibility analysis timed out")), policy.actionTimeoutMs);
    });
    raw = await Promise.race([
      new AxeBuilder({ page })
        .withTags([...accessibilityRulesetTags])
        .setLegacyMode(true)
        .options({ resultTypes: ["violations", "incomplete"], iframes: false })
        .analyze(),
      timeout,
    ]);
  } catch {
    return { status: "failed", code: "AXE_EXECUTION_FAILED" };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
  if (state.requestCount !== requestCountBefore) return { status: "failed", code: "AXE_EXECUTION_FAILED" };
  try {
    return { status: "completed", engine: accessibilityEngineMetadata, evaluation: normalizeAxeResults(raw) };
  } catch {
    return { status: "failed", code: "AXE_RESULT_INVALID" };
  }
}
