import {
  scannerInternalErrorEnvelopeSchema,
  scannerResultSchema,
  scannerValidationRequestSchema,
  type ScannerInternalErrorCode,
  type ScannerResult,
  type ScannerValidationRequest,
} from "@siteprobe/contracts";

export type ScannerFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ScannerClientOptions = {
  baseUrl: string;
  internalToken: string | undefined;
  timeoutMs?: number;
  fetchImpl?: ScannerFetch;
};

export class ScannerClientError extends Error {
  readonly code: ScannerInternalErrorCode;
  readonly statusCode?: number;

  constructor(code: ScannerInternalErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = "ScannerClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parseErrorResponse(response: Response): ScannerClientError {
  return new ScannerClientError(
    "SCANNER_UNAVAILABLE",
    `Scanner request failed with status ${response.status}`,
    response.status,
  );
}

export function createScannerClient(options: ScannerClientOptions) {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new ScannerClientError("SCANNER_NOT_CONFIGURED", "Scanner URL must use HTTP or HTTPS");
  }
  const timeoutMs = options.timeoutMs ?? 35_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async scan(input: ScannerValidationRequest): Promise<ScannerResult> {
      if (!options.internalToken?.trim()) {
        throw new ScannerClientError("SCANNER_NOT_CONFIGURED", "Scanner internal token is not configured");
      }
      let request: ScannerValidationRequest;
      try {
        request = scannerValidationRequestSchema.parse(input);
      } catch {
        throw new ScannerClientError("INVALID_REQUEST", "Scanner request is invalid");
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetchImpl(new URL("/internal/scans", baseUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.internalToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const bodyText = await response.text();
        let body: unknown;
        try {
          body = JSON.parse(bodyText);
        } catch {
          throw new ScannerClientError("SCANNER_INVALID_RESPONSE", "Scanner returned invalid JSON", response.status);
        }

        if (!response.ok) {
          const error = scannerInternalErrorEnvelopeSchema.safeParse(body);
          if (error.success) {
            throw new ScannerClientError(error.data.error.code, error.data.error.message, response.status);
          }
          throw parseErrorResponse(response);
        }

        const result = scannerResultSchema.safeParse(body);
        if (!result.success) {
          throw new ScannerClientError("SCANNER_INVALID_RESPONSE", "Scanner returned an invalid result", response.status);
        }
        return result.data;
      } catch (error) {
        if (error instanceof ScannerClientError) throw error;
        if (timedOut) throw new ScannerClientError("SCANNER_TIMEOUT", "Scanner request timed out");
        throw new ScannerClientError("SCANNER_UNAVAILABLE", "Scanner is unavailable");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type ScannerClient = ReturnType<typeof createScannerClient>;
