import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from '@/config/environment';
import {
  ApiConfigurationError,
  ContractError,
  NetworkError,
  TimeoutError,
  buildApiUrl,
} from '@/services/api/client';
import { createScan, getScan } from '@/features/scans/scan-api';

const scanFixture = {
  id: '00000000-0000-4000-8000-000000000000',
  url: 'https://example.com/',
  status: 'completed',
  score: 87,
  summary: { critical: 2, warnings: 6, passed: 31 },
  createdAt: '2026-08-20T00:00:00.000Z',
  completedAt: '2026-08-20T00:00:00.100Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('mobile API configuration and client', () => {
  it('normalizes the configured API origin and constructs paths', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000///';

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:3000');
    expect(buildApiUrl('/api/scans')).toBe('http://127.0.0.1:3000/api/scans');
  });

  it('fails clearly when the API origin is missing or invalid', () => {
    expect(() => getApiBaseUrl()).toThrow(ApiConfigurationError);
    process.env.EXPO_PUBLIC_API_URL = 'ftp://example.com';
    expect(() => getApiBaseUrl()).toThrow(ApiConfigurationError);
  });

  it('creates and retrieves runtime-validated scans', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => scanFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createScan('https://example.com')).resolves.toEqual(scanFixture);
    await expect(getScan(scanFixture.id)).resolves.toEqual(scanFixture);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3000/api/scans');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  });

  it('maps validated server errors, malformed success, and network failures', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Scan not found',
            requestId: 'req-1',
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'bad' }) })
      .mockRejectedValueOnce(new Error('offline')));

    await expect(getScan(scanFixture.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(getScan(scanFixture.id)).rejects.toBeInstanceOf(ContractError);
    await expect(getScan(scanFixture.id)).rejects.toBeInstanceOf(NetworkError);
  });

  it('aborts a request after the bounded timeout', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3000';
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
    ));

    const request = getScan(scanFixture.id);
    const timeoutAssertion = expect(request).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);
    await timeoutAssertion;
  });
});
