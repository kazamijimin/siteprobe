import { describe, expect, it } from "vitest";

import {
  scannerSafetyEvaluationSchema,
  scannerValidationRequestSchema,
} from "./scanner.js";

describe("internal scanner contracts", () => {
  it("accepts a scanner validation request without exposing it as a mobile API shape", () => {
    expect(
      scannerValidationRequestSchema.parse({
        scanId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
        url: "https://example.com/",
      }),
    ).toEqual({
      scanId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
      url: "https://example.com/",
    });
  });

  it("models allowed and rejected internal safety outcomes", () => {
    expect(
      scannerSafetyEvaluationSchema.parse({
        allowed: true,
        normalizedUrl: "https://example.com/",
        resolvedAddresses: ["93.184.216.34"],
      }),
    ).toMatchObject({ allowed: true });
    expect(
      scannerSafetyEvaluationSchema.parse({
        allowed: false,
        reason: "UNSAFE_DNS_RESULT",
      }),
    ).toEqual({ allowed: false, reason: "UNSAFE_DNS_RESULT" });
  });
});
