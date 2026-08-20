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
    });
  });
});
