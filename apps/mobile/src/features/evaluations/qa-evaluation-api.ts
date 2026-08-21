import {
  controlledQaEvaluationPublicResponseSchema,
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
