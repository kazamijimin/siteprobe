import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("API configuration", () => {
  it("requires a PostgreSQL DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
    expect(() => loadConfig({ DATABASE_URL: "https://example.com" })).toThrow(
      "DATABASE_URL must be a PostgreSQL connection URL",
    );
  });

  it("applies local defaults while preserving the database URL", () => {
    expect(loadConfig({ DATABASE_URL: "postgresql://siteprobe@127.0.0.1:5432/siteprobe" })).toEqual({
      host: "127.0.0.1",
      port: 3000,
      databaseUrl: "postgresql://siteprobe@127.0.0.1:5432/siteprobe",
      scannerUrl: "http://127.0.0.1:3100",
      scannerInternalToken: undefined,
      qaEvaluationInternalToken: undefined,
      qaEvaluationPublicReadEnabled: false,
      accessibilityEvaluationPublicReadEnabled: false,
    });
  });

  it("keeps the QA evaluation token optional and server-side", () => {
    expect(loadConfig({ DATABASE_URL: "postgresql://siteprobe@127.0.0.1:5432/siteprobe", QA_EVALUATION_INTERNAL_TOKEN: "qa-secret" }).qaEvaluationInternalToken).toBe("qa-secret");
  });

  it("defaults the public QA evaluation read adapter off and accepts explicit booleans", () => {
    const databaseUrl = "postgresql://siteprobe@127.0.0.1:5432/siteprobe";
    expect(loadConfig({ DATABASE_URL: databaseUrl }).qaEvaluationPublicReadEnabled).toBe(false);
    expect(loadConfig({ DATABASE_URL: databaseUrl, QA_EVALUATION_PUBLIC_READ_ENABLED: "false" }).qaEvaluationPublicReadEnabled).toBe(false);
    expect(loadConfig({ DATABASE_URL: databaseUrl, QA_EVALUATION_PUBLIC_READ_ENABLED: "true" }).qaEvaluationPublicReadEnabled).toBe(true);
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, QA_EVALUATION_PUBLIC_READ_ENABLED: "TRUE" })).toThrow();
  });

  it("defaults the accessibility public read adapter off and accepts explicit booleans", () => {
    const databaseUrl = "postgresql://siteprobe@127.0.0.1:5432/siteprobe";
    expect(loadConfig({ DATABASE_URL: databaseUrl }).accessibilityEvaluationPublicReadEnabled).toBe(false);
    expect(loadConfig({ DATABASE_URL: databaseUrl, ACCESSIBILITY_EVALUATION_PUBLIC_READ_ENABLED: "true" }).accessibilityEvaluationPublicReadEnabled).toBe(true);
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, ACCESSIBILITY_EVALUATION_PUBLIC_READ_ENABLED: "TRUE" })).toThrow();
  });
});
