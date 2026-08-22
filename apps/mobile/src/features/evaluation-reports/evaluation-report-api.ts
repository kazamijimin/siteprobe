import {
  evaluationReportPublicResponseSchema,
  type EvaluationReportPublicResponse,
} from '@siteprobe/contracts';
import { requestJson } from '@/services/api/client';

export function getEvaluationReport(id: string, signal?: AbortSignal): Promise<EvaluationReportPublicResponse> {
  return requestJson(
    `/api/evaluation-reports/${encodeURIComponent(id)}`,
    evaluationReportPublicResponseSchema,
    { method: 'GET', signal },
  );
}
