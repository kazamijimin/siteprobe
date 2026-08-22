import {
  listSeoEvaluationsResponseSchema,
  seoEvaluationPublicResponseSchema,
  type ListSeoEvaluationsResponse,
  type SeoEvaluationPublicResponse,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export function getSeoEvaluation(id: string, signal?: AbortSignal): Promise<SeoEvaluationPublicResponse> {
  return requestJson(`/api/seo-evaluations/${encodeURIComponent(id)}`, seoEvaluationPublicResponseSchema, { method: 'GET', signal });
}

export type ListSeoEvaluationsOptions = { limit?: number; cursor?: string; signal?: AbortSignal };

export function listSeoEvaluations(options: ListSeoEvaluationsOptions = {}): Promise<ListSeoEvaluationsResponse> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) params.set('cursor', options.cursor);
  return requestJson(`/api/seo-evaluations?${params.toString()}`, listSeoEvaluationsResponseSchema, { method: 'GET', signal: options.signal });
}
