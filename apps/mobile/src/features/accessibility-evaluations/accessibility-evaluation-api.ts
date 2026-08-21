import {
  accessibilityEvaluationPublicResponseSchema,
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
