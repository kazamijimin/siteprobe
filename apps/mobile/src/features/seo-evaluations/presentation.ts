import type { ControlledEvaluationProvenance, SeoEvaluationListItem, SeoEvidence, SeoFindingStatus, SeoSeverity } from '@siteprobe/contracts';

export function formatSeoProvenance(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Controlled Fixture';
  if (provenance === 'real-site-smoke-test') return 'Real-site Smoke Test';
  return 'Legacy / Unknown Source';
}

export function formatSeoProvenanceDescription(provenance: ControlledEvaluationProvenance | undefined): string {
  if (provenance === 'controlled-fixture') return 'Produced from a repository-controlled browser fixture.';
  if (provenance === 'real-site-smoke-test') return 'Produced from a developer-only real-site smoke scan.';
  return 'Origin could not be determined for this historical result.';
}

export function formatSeoSummary(summary: SeoEvaluationListItem['summary']): string {
  return `Passed ${summary.passed} · Warnings ${summary.warnings} · Not applicable ${summary.notApplicable}`;
}

export function formatSeoTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatSeoStatus(status: SeoFindingStatus): string {
  if (status === 'notApplicable') return 'Not applicable';
  return status === 'passed' ? 'Passed' : 'Warning';
}

export function formatSeoSeverity(severity: SeoSeverity): string {
  return severity === 'warning' ? 'Warning' : 'Info';
}

export function seoRuleTitle(ruleId: string): string {
  const titles: Record<string, string> = {
    SEO_TITLE_PRESENT: 'Title present',
    SEO_TITLE_LENGTH: 'Title length',
    SEO_META_DESCRIPTION_PRESENT: 'Meta description present',
    SEO_META_DESCRIPTION_LENGTH: 'Meta description length',
    SEO_CANONICAL_PRESENT: 'Canonical URL present',
    SEO_HTML_LANG_PRESENT: 'HTML language present',
    SEO_VIEWPORT_PRESENT: 'Viewport metadata present',
    SEO_SINGLE_H1: 'Single H1 heading',
    SEO_IMAGES_HAVE_ALT: 'Images have alt text',
  };
  return titles[ruleId] ?? ruleId;
}

export function seoEvidenceSummary(evidence: SeoEvidence): string {
  switch (evidence.kind) {
    case 'title': return evidence.present ? `Present · ${evidence.characterCount} characters` : 'Missing';
    case 'description': return evidence.present ? `Present · ${evidence.characterCount} characters` : 'Missing';
    case 'canonical': return evidence.present ? `Present · ${evidence.value ?? 'value unavailable'}` : 'Missing';
    case 'htmlLang': return evidence.present ? `Present · ${evidence.value ?? 'value unavailable'}` : 'Missing';
    case 'viewport': return evidence.present ? `Present · ${evidence.value ?? 'value unavailable'}` : 'Missing';
    case 'headings': return `H1 count: ${evidence.h1Count}`;
    case 'images': return `${evidence.missingAltCount} of ${evidence.imageCount} images missing alt text`;
  }
}

export function seoRemediation(finding: { ruleId: string; status: SeoFindingStatus; evidence: SeoEvidence }): string | null {
  if (finding.status !== 'failed') return null;
  switch (finding.ruleId) {
    case 'SEO_TITLE_PRESENT': return 'Add a descriptive <title> element to the document head.';
    case 'SEO_TITLE_LENGTH': return 'Review the title so it is concise and descriptive for search results.';
    case 'SEO_META_DESCRIPTION_PRESENT': return 'Add a descriptive <meta name="description"> element.';
    case 'SEO_META_DESCRIPTION_LENGTH': return 'Rewrite the meta description to communicate the page clearly within a useful length.';
    case 'SEO_CANONICAL_PRESENT': return 'Add a canonical link that identifies the preferred page URL.';
    case 'SEO_HTML_LANG_PRESENT': return 'Set the document html lang attribute to the primary page language.';
    case 'SEO_VIEWPORT_PRESENT': return 'Add responsive viewport metadata for mobile rendering.';
    case 'SEO_SINGLE_H1': return 'Review heading hierarchy and keep the primary page heading clear.';
    case 'SEO_IMAGES_HAVE_ALT': return 'Add meaningful alternative text for informative images.';
    default: return null;
  }
}
