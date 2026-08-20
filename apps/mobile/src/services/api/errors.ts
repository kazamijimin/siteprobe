import { ApiConfigurationError } from '@/config/environment';
import { ApiError, ContractError, NetworkError, TimeoutError } from '@/services/api/client';

export function getUserFacingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NOT_FOUND') {
      return 'Scan not found.';
    }
    if (error.details.length > 0) {
      return error.details[0].message;
    }
    return error.message;
  }

  if (error instanceof ApiConfigurationError) {
    return error.message;
  }
  if (error instanceof TimeoutError) {
    return error.message;
  }
  if (error instanceof ContractError) {
    return error.message;
  }
  if (error instanceof NetworkError) {
    return error.message;
  }
  return 'Something went wrong while contacting SiteProbe API.';
}
