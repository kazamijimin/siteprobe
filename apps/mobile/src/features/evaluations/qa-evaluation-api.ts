import {
  listControlledQaEvaluationsResponseSchema,
  controlledQaEvaluationPublicResponseSchema,
  type ListControlledQaEvaluationsResponse,
  type ControlledQaEvaluationPublicResponse,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export function getQaEvaluation(
  id: string,
  signal?: AbortSignal,
): Promise<ControlledQaEvaluationPublicResponse> {
  return requestJson(
    `/api/qa-evaluations/${encodeURIComponent(id)}`,
    controlledQaEvaluationPublicResponseSchema,
    { method: 'GET', signal },
  );
}

export type ListQaEvaluationsOptions = {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export function listQaEvaluations(
  options: ListQaEvaluationsOptions = {},
): Promise<ListControlledQaEvaluationsResponse> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) params.set('cursor', options.cursor);
  return requestJson(
    `/api/qa-evaluations?${params.toString()}`,
    listControlledQaEvaluationsResponseSchema,
    { method: 'GET', signal: options.signal },
  );
}
