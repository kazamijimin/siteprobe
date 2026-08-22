import { describe, expect, it, vi } from 'vitest';
import { listEvaluationReports } from './evaluation-report-history-api';
import { requestJson } from '@/services/api/client';

vi.mock('@/services/api/client', () => ({ requestJson: vi.fn() }));

const response = {
  reports: [],
  nextCursor: null,
};

describe('unified report history API', () => {
  it('builds a server-side provenance-filtered request', async () => {
    vi.mocked(requestJson).mockResolvedValue(response);
    await listEvaluationReports({ source: 'real-site-smoke-test', limit: 20 });
    expect(requestJson).toHaveBeenCalledWith(
      '/api/evaluation-reports?limit=20&source=real-site-smoke-test',
      expect.anything(),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('preserves cursor pagination and abort signals', async () => {
    vi.mocked(requestJson).mockResolvedValue(response);
    const signal = new AbortController().signal;
    await listEvaluationReports({ source: 'legacy-unknown', limit: 5, cursor: 'abc_123', signal });
    expect(requestJson).toHaveBeenCalledWith(
      '/api/evaluation-reports?limit=5&source=legacy-unknown&cursor=abc_123',
      expect.anything(),
      expect.objectContaining({ method: 'GET', signal }),
    );
  });
});
