import { describe, expect, it } from "vitest";
import { isControlledEvaluationUrl } from "./real-site-policy.js";

describe("development real-site ingestion policy", () => {
  it("keeps fixture URLs accepted and allows only ReaDirect when enabled", () => {
    expect(isControlledEvaluationUrl("http://fixture.invalid/healthy", false)).toBe(true);
    expect(isControlledEvaluationUrl("https://readirect.org/", true)).toBe(true);
    expect(isControlledEvaluationUrl("https://www.readirect.org/path", true)).toBe(true);
  });

  it.each([
    "https://google.com",
    "https://readirect.org.evil.example",
    "http://127.0.0.1",
    "ftp://readirect.org",
    "https://user:pass@readirect.org",
  ])("rejects non-ReaDirect URL when enabled: %s", (target) => {
    expect(isControlledEvaluationUrl(target, true)).toBe(false);
  });

  it("does not broaden the existing route policy when the feature flag is disabled", () => {
    expect(isControlledEvaluationUrl("https://readirect.org/", false)).toBe(false);
  });
});
