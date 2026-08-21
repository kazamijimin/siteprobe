import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from '@/config/environment';
import { ContractError } from '@/services/api/client';
import { getQaEvaluation } from '@/features/evaluations/qa-evaluation-api';

const evaluationFixture = {
  id: '00000000-0000-4000-8000-000000000000',
  source: 'controlled-scanner' as const,
  schemaVersion: 1 as const,
  evaluatorVersion: 1 as const,
  requestedUrl: 'https://example.com/',
  finalUrl: 'https://example.com/',
  scannedAt: '2026-08-20T00:00:00.000Z',
  evaluation: {
    findings: [
      { ruleId: 'NAVIGATION_COMPLETED' as const, category: 'navigation' as const, status: 'passed' as const, severity: 'info' as const, title: 'Navigation completed', description: 'The scan completed successfully.', evidence: { kind: 'navigation' as const, navigationSucceeded: true, failureCode: null, requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', navigationDurationMs: 42 } },
      { ruleId: 'HTTP_STATUS_ACCEPTABLE' as const, category: 'navigation' as const, status: 'passed' as const, severity: 'info' as const, title: 'HTTP status acceptable', description: 'The final document returned an acceptable HTTP status.', evidence: { kind: 'httpStatus' as const, value: 200 } },
      { ruleId: 'DOCUMENT_TITLE_PRESENT' as const, category: 'document' as const, status: 'passed' as const, severity: 'info' as const, title: 'Document title present', description: 'The document contains a non-empty title.', evidence: { kind: 'title' as const, present: true, characterCount: 7 } },
      { ruleId: 'NO_CONSOLE_ERRORS' as const, category: 'runtime' as const, status: 'passed' as const, severity: 'info' as const, title: 'No console errors', description: 'No error-level console messages were recorded.', evidence: { kind: 'messages' as const, recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: 'NO_PAGE_ERRORS' as const, category: 'runtime' as const, status: 'passed' as const, severity: 'info' as const, title: 'No uncaught page errors', description: 'No uncaught page runtime errors were recorded.', evidence: { kind: 'messages' as const, recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: 'NO_FAILED_REQUESTS' as const, category: 'network' as const, status: 'passed' as const, severity: 'info' as const, title: 'No failed requests', description: 'No requests failed or were blocked.', evidence: { kind: 'failedRequests' as const, recordedCount: 0, samples: [], samplesTruncated: false } },
    ],
    summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 },
  },
  createdAt: '2026-08-20T00:01:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('controlled QA evaluation API', () => {
  it('requests the encoded detail path and validates a response', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => evaluationFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getQaEvaluation(evaluationFixture.id)).resolves.toEqual(evaluationFixture);
    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/api/qa-evaluations/${encodeURIComponent(evaluationFixture.id)}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects malformed success responses and maps API errors', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...evaluationFixture, scannerRunId: '00000000-0000-4000-8000-000000000001' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: 'req-1' } }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'QA evaluation not found', requestId: 'req-2' } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'req-3' } }) }));

    await expect(getQaEvaluation(evaluationFixture.id)).rejects.toBeInstanceOf(ContractError);
    await expect(getQaEvaluation(evaluationFixture.id)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(getQaEvaluation(evaluationFixture.id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(getQaEvaluation(evaluationFixture.id)).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('forwards cancellation and preserves the existing bounded timeout behavior', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = getQaEvaluation(evaluationFixture.id, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
