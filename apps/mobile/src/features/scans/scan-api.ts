import {
  scanResponseSchema,
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
