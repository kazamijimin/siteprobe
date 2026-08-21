import { describe, expect, it } from "vitest";
import type { AccessibilityEvaluationCreate } from "@siteprobe/contracts";
import { buildApp } from "../app.js";
import { InMemoryAccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";

const token = "qa-test-token-which-is-long-enough";
const body: AccessibilityEvaluationCreate = {
  schemaVersion: 1,
  evaluatorVersion: 1,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  requestedUrl: "http://fixture.invalid/accessibility-clean",
  finalUrl: "http://fixture.invalid/accessibility-clean",
  scannedAt: "2026-08-21T00:00:00.000Z",
  engine: "axe-core",
  engineVersion: "4.13.0",
  adapter: "@axe-core/playwright",
  adapterVersion: "4.13.0",
  rulesetTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  evaluation: {
    status: "completed",
    summary: { violationRules: 0, violationNodes: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknownImpact: 0, needsReviewRules: 0, needsReviewNodes: 0 },
    violations: [],
    needsReview: [],
    violationsTruncated: false,
    needsReviewTruncated: false,
    countsCapped: false,
    payloadTruncated: false,
  },
};

describe("internal accessibility evaluation routes", () => {
  it("returns 503 without a token and never exposes a public route", async () => {
    const app = buildApp({ logger: false });
    expect((await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", payload: body })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/api/accessibility-evaluations" })).statusCode).toBe(404);
    await app.close();
  });

  it("requires auth, creates idempotently, detects conflicts, and retrieves", async () => {
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, accessibilityEvaluationRepository: new InMemoryAccessibilityEvaluationRepository() });
    expect((await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", payload: body })).statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", headers: { authorization: `Bearer ${token}` }, payload: body });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const retry = await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", headers: { authorization: `Bearer ${token}` }, payload: body });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(id);
    const conflict = await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", headers: { authorization: `Bearer ${token}` }, payload: { ...body, requestedUrl: "http://fixture.invalid/other", finalUrl: "http://fixture.invalid/other" } });
    expect(conflict.statusCode).toBe(409);
    const fetched = await app.inject({ method: "GET", url: `/internal/accessibility-evaluations/${id}`, headers: { authorization: `Bearer ${token}` } });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().engineVersion).toBe("4.13.0");
    expect((await app.inject({ method: "GET", url: "/internal/accessibility-evaluations/not-a-uuid", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(400);
    await app.close();
  });

  it("rejects arbitrary URL-shaped and unknown-field payloads", async () => {
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, accessibilityEvaluationRepository: new InMemoryAccessibilityEvaluationRepository() });
    for (const payload of [
      { ...body, requestedUrl: "https://example.com/" },
      { ...body, extra: true },
      { ...body, evaluation: { ...body.evaluation, status: "failed" } },
    ]) {
      const response = await app.inject({ method: "POST", url: "/internal/accessibility-evaluations", headers: { authorization: `Bearer ${token}` }, payload });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});
