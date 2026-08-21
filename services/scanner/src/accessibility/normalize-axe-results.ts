import { Buffer } from "node:buffer";
import {
  ACCESSIBILITY_MAX_SERIALIZED_BYTES,
  accessibilityImpactSchema,
  accessibilityRulesetTags,
  type AccessibilityCompletedEvaluation,
  type AccessibilityImpact,
  type AccessibilityRuleResult,
} from "@siteprobe/contracts";

type AxeResults = {
  violations: readonly AxeRuleResult[];
  incomplete: readonly AxeRuleResult[];
};

type AxeRuleResult = {
  id: unknown;
  impact?: unknown;
  help: unknown;
  nodes: readonly AxeNodeResult[];
};

type AxeNodeResult = {
  target: unknown;
  failureSummary?: unknown;
};

const MAX_RULES = { violations: 20, needsReview: 10 } as const;
const MAX_NODES = 1_000_000;

function boundedText(value: unknown, max: number): { value: string; truncated: boolean } {
  if (typeof value !== "string") throw new Error("Accessibility result contains a non-string diagnostic");
  return { value: value.slice(0, max), truncated: value.length > max };
}

function flattenTarget(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTarget);
  if (value && typeof value === "object" && "fromShadowDom" in value) {
    return ["fromShadowDom", ...flattenTarget((value as { fromShadowDom?: unknown }).fromShadowDom)];
  }
  return [];
}

function normalizeImpact(value: unknown): AccessibilityImpact {
  const parsed = accessibilityImpactSchema.safeParse(value ?? null);
  if (!parsed.success) throw new Error("Accessibility result contains an invalid impact");
  return parsed.data;
}

function canonicalSample(sample: { target: string[]; failureSummary: string | null }): string {
  return `${sample.target.join(" >>> ")}\u0000${sample.failureSummary ?? ""}`;
}

function normalizeRule(rule: AxeRuleResult): AccessibilityRuleResult {
  const id = boundedText(rule.id, 64);
  if (!/^[a-z0-9-]+$/.test(id.value)) throw new Error("Accessibility result contains an invalid rule ID");
  const help = boundedText(rule.help, 256);
  const sourceNodes = Array.isArray(rule.nodes) ? rule.nodes : [];
  const affectedNodeCountCapped = sourceNodes.length > MAX_NODES;
  const samples = sourceNodes.slice(0, 3).map((node) => {
    const targetParts = flattenTarget(node.target);
    const target = targetParts.slice(0, 4).map((part) => part.slice(0, 128));
    const targetTruncated = targetParts.length > 4 || targetParts.some((part) => part.length > 128) || target.join(" >>> ").length > 512;
    const combinedTarget = target.join(" >>> ").slice(0, 512);
    const failure = node.failureSummary == null ? { value: null, truncated: false } : boundedText(node.failureSummary, 512);
    return {
      target: combinedTarget.length === 0 ? [] : combinedTarget.split(" >>> ").map((part) => part.slice(0, 128)),
      failureSummary: failure.value,
      diagnosticTruncated: targetTruncated || failure.truncated,
    };
  }).sort((left, right) => canonicalSample(left).localeCompare(canonicalSample(right)));
  return {
    ruleId: id.value,
    impact: normalizeImpact(rule.impact),
    help: help.value,
    affectedNodeCount: Math.min(sourceNodes.length, MAX_NODES),
    affectedNodeCountCapped,
    samples: samples.map(({ target, failureSummary }) => ({ target, failureSummary })),
    samplesTruncated: sourceNodes.length > 3 || help.truncated || id.truncated || samples.some((sample) => sample.diagnosticTruncated),
  };
}

function impactRank(impact: AccessibilityImpact): number {
  return impact === "critical" ? 0
    : impact === "serious" ? 1
      : impact === "moderate" ? 2
        : impact === "minor" ? 3
          : 4;
}

function sortRules(left: AccessibilityRuleResult, right: AccessibilityRuleResult): number {
  const impactDifference = impactRank(left.impact) - impactRank(right.impact);
  if (impactDifference !== 0) return impactDifference;
  const idDifference = left.ruleId.localeCompare(right.ruleId);
  if (idDifference !== 0) return idDifference;
  return canonicalSample(left.samples[0] ?? { target: [], failureSummary: null })
    .localeCompare(canonicalSample(right.samples[0] ?? { target: [], failureSummary: null }));
}

function summarize(violations: readonly AccessibilityRuleResult[], needsReview: readonly AccessibilityRuleResult[], countsCapped: boolean): AccessibilityCompletedEvaluation["summary"] {
  const countByImpact = (impact: AccessibilityImpact) => violations.reduce((count, rule) => count + (rule.impact === impact ? 1 : 0), 0);
  return {
    violationRules: Math.min(violations.length, MAX_NODES),
    violationNodes: Math.min(violations.reduce((sum, rule) => sum + rule.affectedNodeCount, 0), MAX_NODES),
    critical: countByImpact("critical"),
    serious: countByImpact("serious"),
    moderate: countByImpact("moderate"),
    minor: countByImpact("minor"),
    unknownImpact: countByImpact(null),
    needsReviewRules: Math.min(needsReview.length, MAX_NODES),
    needsReviewNodes: Math.min(needsReview.reduce((sum, rule) => sum + rule.affectedNodeCount, 0), MAX_NODES),
  };
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function lastRuleIndexWithSamples(rules: readonly AccessibilityRuleResult[]): number {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    if (rules[index].samples.length > 0) return index;
  }
  return -1;
}

function reduceToByteBound(result: AccessibilityCompletedEvaluation): AccessibilityCompletedEvaluation {
  let reduced = structuredClone(result);
  while (serializedBytes(reduced) > ACCESSIBILITY_MAX_SERIALIZED_BYTES) {
    const reviewWithSamples = lastRuleIndexWithSamples(reduced.needsReview);
    if (reviewWithSamples >= 0) {
      reduced.needsReview[reviewWithSamples].samples.pop();
      reduced.needsReview[reviewWithSamples].samplesTruncated = true;
      reduced.payloadTruncated = true;
      continue;
    }
    const violationWithSamples = lastRuleIndexWithSamples(reduced.violations);
    if (violationWithSamples >= 0) {
      reduced.violations[violationWithSamples].samples.pop();
      reduced.violations[violationWithSamples].samplesTruncated = true;
      reduced.payloadTruncated = true;
      continue;
    }
    if (reduced.needsReview.length > 0) {
      reduced.needsReview.pop();
      reduced.needsReviewTruncated = true;
      reduced.payloadTruncated = true;
      continue;
    }
    if (reduced.violations.length > 0) {
      reduced.violations.pop();
      reduced.violationsTruncated = true;
      reduced.payloadTruncated = true;
      continue;
    }
    throw new Error("Accessibility result cannot be reduced to the serialized size bound");
  }
  return reduced;
}

export function normalizeAxeResults(raw: unknown): AccessibilityCompletedEvaluation {
  const results = raw as AxeResults;
  if (!results || !Array.isArray(results.violations) || !Array.isArray(results.incomplete)) {
    throw new Error("Accessibility engine returned an invalid result");
  }
  const violations = results.violations.map(normalizeRule).sort(sortRules);
  const needsReview = results.incomplete.map(normalizeRule).sort(sortRules);
  const countsCapped = [...violations, ...needsReview].some((rule) => rule.affectedNodeCountCapped);
  const normalized: AccessibilityCompletedEvaluation = {
    status: "completed",
    summary: summarize(violations, needsReview, countsCapped),
    violations: violations.slice(0, MAX_RULES.violations),
    needsReview: needsReview.slice(0, MAX_RULES.needsReview),
    violationsTruncated: violations.length > MAX_RULES.violations,
    needsReviewTruncated: needsReview.length > MAX_RULES.needsReview,
    countsCapped,
    payloadTruncated: false,
  };
  return reduceToByteBound(normalized);
}

export function accessibilityRulesetTagValues(): readonly string[] {
  return accessibilityRulesetTags;
}
