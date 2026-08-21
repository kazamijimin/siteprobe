import { describe, expect, it } from 'vitest';
import { formatSeoProvenance, formatSeoStatus, seoEvidenceSummary, seoRemediation, seoRuleTitle } from './presentation';

describe('SEO presentation helpers', () => {
  it('labels provenance and all canonical rules', () => {
    expect(formatSeoProvenance('real-site-smoke-test')).toBe('Real-site Smoke Test');
    expect(formatSeoProvenance('controlled-fixture')).toBe('Controlled Fixture');
    expect(formatSeoRuleTitles()).toHaveLength(9);
  });

  it('summarizes evidence and remediation without scoring', () => {
    expect(formatSeoStatus('notApplicable')).toBe('Not applicable');
    expect(seoEvidenceSummary({ kind: 'images', imageCount: 2, missingAltCount: 1, samples: [], samplesTruncated: false })).toContain('1 of 2');
    expect(seoRemediation({ ruleId: 'SEO_TITLE_PRESENT', status: 'failed', evidence: { kind: 'title', present: false, value: null, characterCount: 0, truncated: false } })).toContain('<title>');
    expect(seoRemediation({ ruleId: 'SEO_TITLE_PRESENT', status: 'passed', evidence: { kind: 'title', present: true, value: 'x', characterCount: 1, truncated: false } })).toBeNull();
  });
});

function formatSeoRuleTitles() {
  return ['SEO_TITLE_PRESENT', 'SEO_TITLE_LENGTH', 'SEO_META_DESCRIPTION_PRESENT', 'SEO_META_DESCRIPTION_LENGTH', 'SEO_CANONICAL_PRESENT', 'SEO_HTML_LANG_PRESENT', 'SEO_VIEWPORT_PRESENT', 'SEO_SINGLE_H1', 'SEO_IMAGES_HAVE_ALT'].map(seoRuleTitle);
}
