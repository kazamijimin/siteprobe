import {
  listScansResponseSchema,
  scanResponseSchema,
  type ListScansResponse,
  type ScanResponse,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export async function createScan(url: string): Promise<ScanResponse> {
  return requestJson('/api/scans', scanResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function getScan(id: string, signal?: AbortSignal): Promise<ScanResponse> {
  return requestJson(`/api/scans/${encodeURIComponent(id)}`, scanResponseSchema, {
    method: 'GET',
    signal,
  });
}

export type ListScansOptions = {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export function listScans(options: ListScansOptions = {}): Promise<ListScansResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 20),
  });
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }

  return requestJson(`/api/scans?${params.toString()}`, listScansResponseSchema, {
    method: 'GET',
    signal: options.signal,
  });
}
