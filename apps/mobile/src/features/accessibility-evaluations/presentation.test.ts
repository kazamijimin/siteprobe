import { describe, expect, it } from 'vitest';
import { accessibilityStatusMessage, formatAccessibilityImpact, formatAccessibilityListSource, formatAccessibilityListSummary, formatAccessibilitySummary, ruleSamplesText, truncationMessage } from '@/features/accessibility-evaluations/presentation';

const summary = { violationRules: 1, violationNodes: 2, critical: 1, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 1, needsReviewNodes: 1 };

describe('controlled accessibility presentation', () => {
  it('preserves axe impact terminology and summary fields', () => {
    expect(formatAccessibilityImpact('critical')).toBe('Critical');
    expect(formatAccessibilityImpact(null)).toBe('Unknown impact');
    expect(formatAccessibilitySummary(summary)).toContain('Violation rules 1');
    expect(formatAccessibilitySummary(summary)).toContain('Affected nodes 2');
  });

  it('explains status, samples, and truncation without compliance claims', () => {
    const completed = { status: 'completed' as const, summary, violations: [{ ruleId: 'image-alt', impact: 'critical' as const, help: 'Images need alt text', affectedNodeCount: 2, affectedNodeCountCapped: false, samples: [{ target: ['img.hero'], failureSummary: 'Add an alt attribute.' }], samplesTruncated: true }], needsReview: [], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false };
    expect(accessibilityStatusMessage(completed)).toBe('Automated accessibility findings are shown below.');
    expect(ruleSamplesText(completed.violations[0])).toContain('Target: img.hero');
    expect(truncationMessage(completed)).toBeNull();
    expect(truncationMessage({ ...completed, payloadTruncated: true })).toContain('truncated');
    expect(accessibilityStatusMessage({ status: 'notApplicable', reason: 'navigationFailed', summary: { violationRules: 0, violationNodes: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 0, needsReviewNodes: 0 }, violations: [], needsReview: [], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false })).toContain('navigation failed');
  });

  it('formats compact completed and navigation-failed list cards', () => {
    const completed = {
      id: '6d41977d-ffb9-4388-af0a-0f74c8ee64ab', source: 'controlled-scanner' as const, provenance: 'controlled-fixture' as const, evaluatorVersion: 1 as const,
      requestedUrl: 'http://fixture.invalid/accessibility-mixed', scannedAt: '2026-08-21T00:00:00.000Z', createdAt: '2026-08-21T00:01:00.000Z',
      engine: { engine: 'axe-core' as const, engineVersion: '4.13.0' as const }, status: 'completed' as const, summary,
    };
    expect(formatAccessibilityListSource(completed)).toBe('Automated accessibility check · axe-core 4.13.0');
    expect(formatAccessibilityListSummary(completed)).toContain('Violation rules: 1');
    expect(formatAccessibilityListSummary(completed)).toContain('Needs review: 1');
    expect(formatAccessibilityListSummary({ ...completed, status: 'notApplicable', reason: 'navigationFailed' })).toBe('Not analyzed — navigation failed');
  });
});
