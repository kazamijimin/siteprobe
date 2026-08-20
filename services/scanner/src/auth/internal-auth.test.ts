import { describe, expect, it } from "vitest";

import { hasValidBearerToken } from "./internal-auth.js";

describe("scanner internal authentication", () => {
  it("accepts only the exact bearer token", () => {
    expect(hasValidBearerToken("Bearer scanner-secret", "scanner-secret")).toBe(true);
    expect(hasValidBearerToken(undefined, "scanner-secret")).toBe(false);
    expect(hasValidBearerToken("Bearer wrong", "scanner-secret")).toBe(false);
    expect(hasValidBearerToken("Basic scanner-secret", "scanner-secret")).toBe(false);
  });
});
