import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl, TestDatabaseSafetyError } from "./test-database-guard.js";

const validTestUrl = "postgresql://fake:secret@127.0.0.1:5432/siteprobe_test";

describe("PostgreSQL integration test database guard", () => {
  it("accepts the dedicated local test database", () => {
    expect(assertSafeTestDatabaseUrl(validTestUrl)).toEqual({
      host: "127.0.0.1",
      port: 5432,
      database: "siteprobe_test",
    });
  });

  it("rejects the development database and wrong database names", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://fake:secret@127.0.0.1:5432/siteprobe"))
      .toThrow(TestDatabaseSafetyError);
    expect(() => assertSafeTestDatabaseUrl("postgresql://fake:secret@127.0.0.1:5432/other"))
      .toThrow(TestDatabaseSafetyError);
  });

  it("rejects a normalized match with the normal database even when URL strings differ", () => {
    expect(() => assertSafeTestDatabaseUrl(
      "postgres://fake:secret@127.0.0.1/siteprobe_test",
      "postgresql://fake:other@127.0.0.1:5432/siteprobe_test",
    )).toThrow(TestDatabaseSafetyError);
  });

  it("rejects invalid URLs, missing database names, and unsupported protocols", () => {
    expect(() => assertSafeTestDatabaseUrl("not-a-url")).toThrow(TestDatabaseSafetyError);
    expect(() => assertSafeTestDatabaseUrl("postgresql://fake:secret@127.0.0.1:5432/"))
      .toThrow(TestDatabaseSafetyError);
    expect(() => assertSafeTestDatabaseUrl("https://fake:secret@127.0.0.1:5432/siteprobe_test"))
      .toThrow(TestDatabaseSafetyError);
  });

  it("never includes credentials or the full URL in an error", () => {
    const unsafeUrl = "postgresql://fake:super-secret@127.0.0.1:5432/siteprobe";
    try {
      assertSafeTestDatabaseUrl(unsafeUrl);
      throw new Error("expected guard to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(TestDatabaseSafetyError);
      expect((error as Error).message).not.toContain("super-secret");
      expect((error as Error).message).not.toContain(unsafeUrl);
    }
  });
});
