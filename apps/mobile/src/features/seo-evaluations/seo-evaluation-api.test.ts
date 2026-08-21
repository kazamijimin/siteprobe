import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from '@/config/environment';
import { ContractError } from '@/services/api/client';
import { getSeoEvaluation, listSeoEvaluations } from './seo-evaluation-api';

const fixture = {
  id: '00000000-0000-4000-8000-000000000000', source: 'controlled-scanner' as const, provenance: 'controlled-fixture' as const, schemaVersion: 1 as const, evaluatorVersion: 1 as const,
  requestedUrl: 'http://fixture.invalid/seo-clean', finalUrl: 'http://fixture.invalid/seo-clean', scannedAt: '2026-08-21T00:00:00.000Z', createdAt: '2026-08-21T00:01:00.000Z', relatedQaEvaluationId: null, relatedAccessibilityEvaluationId: null,
  evaluation: { status: 'completed' as const, summary: { passed: 9, warnings: 0, notApplicable: 0 }, findings: [
    { ruleId: 'SEO_TITLE_PRESENT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'title' as const, present: true, value: 'Fixture', characterCount: 7, truncated: false } },
    { ruleId: 'SEO_TITLE_LENGTH' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'title' as const, present: true, value: 'Fixture', characterCount: 7, truncated: false } },
    { ruleId: 'SEO_META_DESCRIPTION_PRESENT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'description' as const, present: true, value: 'A fixture page.', characterCount: 16, truncated: false } },
    { ruleId: 'SEO_META_DESCRIPTION_LENGTH' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'description' as const, present: true, value: 'A fixture page.', characterCount: 16, truncated: false } },
    { ruleId: 'SEO_CANONICAL_PRESENT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'canonical' as const, present: true, value: 'http://fixture.invalid/seo-clean', truncated: false } },
    { ruleId: 'SEO_HTML_LANG_PRESENT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'htmlLang' as const, present: true, value: 'en', truncated: false } },
    { ruleId: 'SEO_VIEWPORT_PRESENT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'viewport' as const, present: true, value: 'width=device-width', truncated: false } },
    { ruleId: 'SEO_SINGLE_H1' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'headings' as const, h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    { ruleId: 'SEO_IMAGES_HAVE_ALT' as const, status: 'passed' as const, severity: 'info' as const, description: 'ok', evidence: { kind: 'images' as const, imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false } },
  ] },
};
const listFixture = { evaluations: [{ id: fixture.id, source: fixture.source, provenance: fixture.provenance, evaluatorVersion: 1 as const, requestedUrl: fixture.requestedUrl, scannedAt: fixture.scannedAt, createdAt: fixture.createdAt, summary: fixture.evaluation.summary }], nextCursor: null };

afterEach(() => { vi.unstubAllGlobals(); delete process.env.EXPO_PUBLIC_API_URL; });

describe('SEO evaluation API', () => {
  it('requests and validates detail responses without scanner-run fields', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => fixture });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getSeoEvaluation(fixture.id)).resolves.toEqual(fixture);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/seo-evaluations/${fixture.id}`, expect.objectContaining({ method: 'GET' }));
  });

  it('validates list responses, cursors, and API errors', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const cursor = 'eyJ2IjoxfQ';
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => listFixture }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ evaluations: [{ ...listFixture.evaluations[0], scannerRunId: fixture.id }], nextCursor: null }) }).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'SEO evaluations not found', requestId: 'req-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(listSeoEvaluations({ limit: 1, cursor })).resolves.toEqual(listFixture);
    expect(fetchMock.mock.calls[0][0]).toBe(`${getApiBaseUrl()}/api/seo-evaluations?limit=1&cursor=${encodeURIComponent(cursor)}`);
    await expect(listSeoEvaluations()).rejects.toBeInstanceOf(ContractError);
    await expect(listSeoEvaluations()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
