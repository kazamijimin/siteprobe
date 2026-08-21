import type {
  ControlledEvaluationProvenance,
  AccessibilityEvaluation,
  AccessibilityEvaluationListItem,
  AccessibilityImpact,
  AccessibilityRuleResult,
  AccessibilitySummary,
} from '@siteprobe/contracts';

export function formatAccessibilityProvenance(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Controlled Fixture';
  if (provenance === 'real-site-smoke-test') return 'Real-site Smoke Test';
  return 'Legacy / Unknown Source';
}

export function formatAccessibilityProvenanceDescription(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Produced from a repository-controlled browser fixture.';
  if (provenance === 'real-site-smoke-test') return 'Produced from a developer-only real-site smoke scan.';
  return 'Origin could not be determined for this historical result.';
}

export function formatAccessibilityListSource(item: Pick<AccessibilityEvaluationListItem, 'engine'>): string {
  return `Automated accessibility check · ${item.engine.engine} ${item.engine.engineVersion}`;
}

export function formatAccessibilityListSummary(item: AccessibilityEvaluationListItem): string {
  if (item.status === 'notApplicable') return 'Not analyzed — navigation failed';
  return [
    `Violation rules: ${item.summary.violationRules}`,
    `Affected nodes: ${item.summary.violationNodes}`,
    `Critical ${item.summary.critical} · Serious ${item.summary.serious} · Moderate ${item.summary.moderate} · Minor ${item.summary.minor}`,
    `Needs review: ${item.summary.needsReviewRules}`,
  ].join('\n');
}

export function formatAccessibilityTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatAccessibilityImpact(impact: AccessibilityImpact): string {
  return impact === null ? 'Unknown impact' : `${impact.charAt(0).toUpperCase()}${impact.slice(1)}`;
}

export function formatAccessibilitySummary(summary: AccessibilitySummary): string {
  return `Violation rules ${summary.violationRules} · Affected nodes ${summary.violationNodes} · Needs-review rules ${summary.needsReviewRules}`;
}

export function accessibilityStatusMessage(evaluation: AccessibilityEvaluation): string {
  if (evaluation.status === 'notApplicable') return 'Accessibility analysis was not performed because navigation failed.';
  return evaluation.summary.violationRules === 0
    ? 'No automated accessibility violations were detected in this controlled check.'
    : 'Automated accessibility findings are shown below.';
}

export function truncationMessage(evaluation: Extract<AccessibilityEvaluation, { status: 'completed' }>): string | null {
  return evaluation.violationsTruncated || evaluation.needsReviewTruncated || evaluation.countsCapped || evaluation.payloadTruncated
    ? 'Some diagnostic details were truncated to keep this evaluation bounded.'
    : null;
}

export function ruleSamplesText(rule: AccessibilityRuleResult): string {
  return rule.samples.map((sample) => [
    `Target: ${sample.target.length > 0 ? sample.target.join(' >>> ') : 'Not available'}`,
    `Failure: ${sample.failureSummary ?? 'Not available'}`,
  ].join('\n')).join('\n\n');
}
