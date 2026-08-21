import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from '@/config/environment';
import { ContractError } from '@/services/api/client';
import { getAccessibilityEvaluation, listAccessibilityEvaluations } from '@/features/accessibility-evaluations/accessibility-evaluation-api';

const fixture = {
  id: '00000000-0000-4000-8000-000000000000', source: 'controlled-scanner' as const, schemaVersion: 1 as const, evaluatorVersion: 1 as const,
  requestedUrl: 'http://fixture.invalid/accessibility-clean', finalUrl: 'http://fixture.invalid/accessibility-clean', scannedAt: '2026-08-21T00:00:00.000Z', createdAt: '2026-08-21T00:01:00.000Z',
  engine: { engine: 'axe-core' as const, engineVersion: '4.13.0' as const, adapter: '@axe-core/playwright' as const, adapterVersion: '4.13.0' as const, rulesetTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const },
  relatedQaEvaluationId: null,
  evaluation: { status: 'completed' as const, summary: { violationRules: 0, violationNodes: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 0, needsReviewNodes: 0 }, violations: [], needsReview: [], violationsTruncated: false, needsReviewTruncated: false, countsCapped: false, payloadTruncated: false },
};
const listFixture = {
  evaluations: [{
    id: fixture.id,
    source: 'controlled-scanner' as const,
    evaluatorVersion: 1 as const,
    requestedUrl: fixture.requestedUrl,
    scannedAt: fixture.scannedAt,
    createdAt: fixture.createdAt,
    engine: { engine: 'axe-core' as const, engineVersion: '4.13.0' as const },
    status: 'completed' as const,
    summary: fixture.evaluation.summary,
  }],
  nextCursor: null,
};

afterEach(() => { vi.unstubAllGlobals(); delete process.env.EXPO_PUBLIC_API_URL; });

describe('controlled accessibility evaluation API', () => {
  it('constructs the encoded detail path and validates the public response', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => fixture });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAccessibilityEvaluation(fixture.id)).resolves.toEqual(fixture);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/accessibility-evaluations/${encodeURIComponent(fixture.id)}`, expect.objectContaining({ method: 'GET' }));
  });

  it('preserves nullable related QA IDs and rejects malformed relation IDs', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...fixture, relatedQaEvaluationId: '00000000-0000-4000-8000-000000000001' }) }));
    await expect(getAccessibilityEvaluation(fixture.id)).resolves.toMatchObject({ relatedQaEvaluationId: '00000000-0000-4000-8000-000000000001' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...fixture, relatedQaEvaluationId: 'invalid' }) }));
    await expect(getAccessibilityEvaluation(fixture.id)).rejects.toBeInstanceOf(ContractError);
  });

  it('rejects malformed successful responses and maps server errors', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...fixture, scannerRunId: fixture.id }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: 'req-1' } }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'Accessibility evaluation not found', requestId: 'req-2' } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'req-3' } }) }));
    await expect(getAccessibilityEvaluation(fixture.id)).rejects.toBeInstanceOf(ContractError);
    await expect(getAccessibilityEvaluation(fixture.id)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(getAccessibilityEvaluation(fixture.id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(getAccessibilityEvaluation(fixture.id)).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('forwards AbortSignal to the shared request client', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = getAccessibilityEvaluation(fixture.id, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it('builds a list URL with limit and encoded cursor and validates the response', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const cursor = 'eyJ2IjoxLCJpZCI6ImN1cnNvciJ9';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => listFixture });
    vi.stubGlobal('fetch', fetchMock);
    await expect(listAccessibilityEvaluations({ limit: 1, cursor })).resolves.toEqual(listFixture);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/accessibility-evaluations?limit=1&cursor=${encodeURIComponent(cursor)}`, expect.objectContaining({ method: 'GET' }));
  });

  it('rejects malformed list responses and preserves server error statuses', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ evaluations: [{ ...listFixture.evaluations[0], scannerRunId: fixture.id }], nextCursor: null }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'Accessibility evaluations not found', requestId: 'req-1' } }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: 'req-2' } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'req-3' } }) }));
    await expect(listAccessibilityEvaluations()).rejects.toBeInstanceOf(ContractError);
    await expect(listAccessibilityEvaluations()).rejects.toMatchObject({ status: 404 });
    await expect(listAccessibilityEvaluations()).rejects.toMatchObject({ status: 400 });
    await expect(listAccessibilityEvaluations()).rejects.toMatchObject({ status: 500 });
  });

  it('forwards an AbortSignal for list requests', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = listAccessibilityEvaluations({ signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
