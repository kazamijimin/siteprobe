import { describe, expect, it } from 'vitest';
import {
  formatEvaluationTimestamp,
  formatEvaluationSource,
  formatEvaluationSummary,
  formatEvidenceCount,
  formatQaCategory,
  formatQaSeverity,
  formatQaStatus,
  formatTruncatedEvidenceCount,
} from '@/features/evaluations/presentation';

describe('controlled QA evaluation presentation', () => {
  it('formats status, severity, and category labels', () => {
    expect(formatQaStatus('passed')).toBe('Passed');
    expect(formatQaStatus('failed')).toBe('Failed');
    expect(formatQaStatus('notApplicable')).toBe('Not applicable');
    expect(formatQaSeverity('info')).toBe('Info');
    expect(formatQaSeverity('warning')).toBe('Warning');
    expect(formatQaSeverity('critical')).toBe('Critical');
    expect(formatQaCategory('navigation')).toBe('Navigation');
    expect(formatQaCategory('document')).toBe('Document');
    expect(formatQaCategory('runtime')).toBe('Runtime');
    expect(formatQaCategory('network')).toBe('Network');
  });

  it('formats compact list metadata without adding score semantics', () => {
    const item = { source: 'controlled-scanner' as const, evaluatorVersion: 1 as const };
    expect(formatEvaluationSource(item)).toBe('Controlled scanner · Evaluator v1');
    expect(formatEvaluationSummary({ critical: 1, warnings: 2, passed: 3, notApplicable: 0 })).toBe('Critical 1 · Warnings 2 · Passed 3 · N/A 0');
  });

  it('formats timestamps and evidence counts without deriving new semantics', () => {
    expect(formatEvaluationTimestamp('2026-08-20T00:00:00.000Z')).toContain('2026');
    expect(formatEvidenceCount('messages', 0)).toBe('Recorded errors: 0');
    expect(formatEvidenceCount('failedRequests', 1)).toBe('Recorded failed requests: 1');
    expect(formatTruncatedEvidenceCount('messages', 3, 5)).toBe('Showing 3 of 5 recorded errors.');
    expect(formatTruncatedEvidenceCount('failedRequests', 2, 5)).toBe('Showing 2 of 5 failed requests.');
  });
});
