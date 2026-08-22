import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from '@/config/environment';
import { ContractError } from '@/services/api/client';
import { getEvaluationReport } from './evaluation-report-api';

const id = '00000000-0000-4000-8000-000000000000';
const report = {
  schemaVersion: 1 as const,
  anchorEvaluationId: id,
  provenance: 'real-site-smoke-test' as const,
  requestedUrl: 'https://readirect.org/',
  finalUrl: 'https://readirect.org/landing',
  scannedAt: '2026-08-22T00:00:00.000Z',
  qa: { available: true as const, evaluationId: id, summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 } },
  accessibility: { available: false as const, reason: 'not-produced' as const },
  seo: { available: false as const, reason: 'public-access-disabled' as const },
  attentionItems: [],
};

afterEach(() => { vi.unstubAllGlobals(); delete process.env.EXPO_PUBLIC_API_URL; });

describe('evaluation report API', () => {
  it('requests and validates the public report', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => report });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getEvaluationReport(id)).resolves.toEqual(report);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/evaluation-reports/${id}`, expect.objectContaining({ method: 'GET' }));
  });

  it('rejects internal fields and maps not-found/API failures', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...report, scannerRunId: id }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'Evaluation report not found', requestId: 'req-1' } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'req-2' } }) }));
    await expect(getEvaluationReport(id)).rejects.toBeInstanceOf(ContractError);
    await expect(getEvaluationReport(id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(getEvaluationReport(id)).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
