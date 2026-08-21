import {
  listAccessibilityEvaluationsResponseSchema,
  accessibilityEvaluationPublicResponseSchema,
  type ListAccessibilityEvaluationsResponse,
  type AccessibilityEvaluationPublicResponse,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export function getAccessibilityEvaluation(
  id: string,
  signal?: AbortSignal,
): Promise<AccessibilityEvaluationPublicResponse> {
  return requestJson(
    `/api/accessibility-evaluations/${encodeURIComponent(id)}`,
    accessibilityEvaluationPublicResponseSchema,
    { method: 'GET', signal },
  );
}

export type ListAccessibilityEvaluationsOptions = {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export function listAccessibilityEvaluations(
  options: ListAccessibilityEvaluationsOptions = {},
): Promise<ListAccessibilityEvaluationsResponse> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) params.set('cursor', options.cursor);
  return requestJson(
    `/api/accessibility-evaluations?${params.toString()}`,
    listAccessibilityEvaluationsResponseSchema,
    { method: 'GET', signal: options.signal },
  );
}
