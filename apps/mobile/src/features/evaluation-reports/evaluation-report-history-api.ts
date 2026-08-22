import {
  listEvaluationReportsQuerySchema,
  listEvaluationReportsResponseSchema,
  type ListEvaluationReportsResponse,
  type ControlledEvaluationProvenance,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export type ListEvaluationReportsOptions = {
  source?: ControlledEvaluationProvenance;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export function listEvaluationReports(options: ListEvaluationReportsOptions = {}): Promise<ListEvaluationReportsResponse> {
  const query = listEvaluationReportsQuerySchema.parse({
    source: options.source,
    limit: options.limit ?? 20,
    cursor: options.cursor,
  });
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.source) params.set('source', query.source);
  if (query.cursor) params.set('cursor', query.cursor);
  return requestJson(`/api/evaluation-reports?${params.toString()}`, listEvaluationReportsResponseSchema, { method: 'GET', signal: options.signal });
}
