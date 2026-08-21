import { describe, expect, it } from "vitest";
import { loadToolConfig, parseApiUrl } from "./config.js";
import { ControlledEvaluationError } from "./errors.js";

describe("controlled evaluation tool configuration", () => {
  it("accepts loopback API origins", () => {
    expect(parseApiUrl("http://127.0.0.1:3000").origin).toBe("http://127.0.0.1:3000");
    expect(parseApiUrl("http://localhost:3010/").origin).toBe("http://localhost:3010");
  });

  it.each([
    "https://127.0.0.1:3000",
    "http://192.168.1.20:3000",
    "http://10.0.0.2:3000",
    "http://public.example:3000",
    "http://user:pass@127.0.0.1:3000",
    "ftp://127.0.0.1:3000",
    "http://127.0.0.1:3000/api",
  ])("rejects unsafe API origin %s", (value) => {
    expect(() => parseApiUrl(value)).toThrow(ControlledEvaluationError);
  });

  it("requires only the ingestion token in addition to the API origin", () => {
    const config = loadToolConfig({ QA_EVALUATION_INTERNAL_TOKEN: "test-only-token" });
    expect(config.apiUrl.origin).toBe("http://127.0.0.1:3000");
    expect(config.internalToken).toBe("test-only-token");
    expect(() => loadToolConfig({ SITEPROBE_API_URL: "http://127.0.0.1:3000" })).toThrow(
      "QA_EVALUATION_INTERNAL_TOKEN is required",
    );
  });
});
