import {
  errorEnvelopeSchema,
  type ErrorCode,
  type ErrorDetail,
} from '@siteprobe/contracts';
import { ApiConfigurationError, getApiBaseUrl } from '@/config/environment';

const REQUEST_TIMEOUT_MS = 10_000;

export class NetworkError extends Error {
  constructor(message = 'Cannot connect to SiteProbe API.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends NetworkError {
  constructor() {
    super('SiteProbe API request timed out. Try again.');
    this.name = 'TimeoutError';
  }
}

export class ContractError extends Error {
  constructor(message = 'SiteProbe received an invalid API response.') {
    super(message);
    this.name = 'ContractError';
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | null;
  readonly details: ErrorDetail[];

  constructor(
    status: number,
    message: string,
    code: ErrorCode | null = null,
    details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

type JsonRequestOptions = {
  method: 'GET' | 'POST';
  body?: string;
  signal?: AbortSignal;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ContractError();
  }
}

export async function requestJson<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  options: JsonRequestOptions,
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    let response: Response;
    try {
      response = await fetch(buildApiUrl(path), {
        method: options.method,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: options.body } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (didTimeout || (error instanceof Error && error.name === 'AbortError')) {
        throw new TimeoutError();
      }
      throw new NetworkError();
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const parsedError = errorEnvelopeSchema.safeParse(payload);
      if (parsedError.success) {
        throw new ApiError(
          response.status,
          parsedError.data.error.message,
          parsedError.data.error.code,
          parsedError.data.error.details ?? [],
        );
      }
      throw new ApiError(response.status, 'SiteProbe API request failed.');
    }

    try {
      return schema.parse(payload);
    } catch {
      throw new ContractError();
    }
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export { ApiConfigurationError };
