import type {
  ControlledQaEvaluationListItem,
  ControlledEvaluationProvenance,
  QaCategory,
  QaEvaluationSummary,
  QaEvidence,
  QaFindingStatus,
  QaSeverity,
} from '@siteprobe/contracts';

export function formatEvaluationSource(item: Pick<ControlledQaEvaluationListItem, 'source' | 'evaluatorVersion'> & { provenance?: ControlledEvaluationProvenance }): string {
  return item.source === 'controlled-scanner'
    ? `Controlled scanner · Evaluator v${item.evaluatorVersion}`
    : item.source;
}

export function formatEvaluationProvenance(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Controlled Fixture';
  if (provenance === 'real-site-smoke-test') return 'Real-site Smoke Test';
  return 'Legacy / Unknown Source';
}

export function formatEvaluationProvenanceDescription(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Produced from a repository-controlled browser fixture.';
  if (provenance === 'real-site-smoke-test') return 'Produced from a developer-only real-site smoke scan.';
  return 'Origin could not be determined for this historical result.';
}

export function formatEvaluationSummary(summary: QaEvaluationSummary): string {
  return `Critical ${summary.critical} · Warnings ${summary.warnings} · Passed ${summary.passed} · N/A ${summary.notApplicable}`;
}

export function formatQaStatus(status: QaFindingStatus): string {
  if (status === 'notApplicable') return 'Not applicable';
  return status === 'passed' ? 'Passed' : 'Failed';
}

export function formatQaSeverity(severity: QaSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatQaCategory(category: QaCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function formatEvaluationTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatEvaluationTimestampForAccessibility(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatEvidenceCount(kind: QaEvidence['kind'], count: number): string {
  const label = kind === 'failedRequests' ? 'Recorded failed requests' : 'Recorded errors';
  return `${label}: ${count}`;
}

export function formatTruncatedEvidenceCount(
  kind: QaEvidence['kind'],
  sampleCount: number,
  recordedCount: number,
): string {
  const label = kind === 'failedRequests' ? 'failed requests' : 'recorded errors';
  return `Showing ${sampleCount} of ${recordedCount} ${label}.`;
}
