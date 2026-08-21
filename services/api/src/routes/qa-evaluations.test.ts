import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { InMemoryQaEvaluationRepository, QaEvaluationPersistenceCorruptionError } from "../evaluations/repository.js";

const token = "qa-test-token-which-is-long-enough";
const body = {
  schemaVersion: 1,
  evaluatorVersion: 1,
  scannerRunId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab",
  requestedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  scannedAt: "2026-08-20T00:00:00.000Z",
  evaluation: {
    findings: [
      { ruleId: "NAVIGATION_COMPLETED", category: "navigation", status: "passed", severity: "info", title: "Navigation completed", description: "ok", evidence: { kind: "navigation", navigationSucceeded: true, failureCode: null, requestedUrl: "https://example.com/", finalUrl: "https://example.com/", navigationDurationMs: 1 } },
      { ruleId: "HTTP_STATUS_ACCEPTABLE", category: "navigation", status: "passed", severity: "info", title: "HTTP status acceptable", description: "ok", evidence: { kind: "httpStatus", value: 200 } },
      { ruleId: "DOCUMENT_TITLE_PRESENT", category: "document", status: "passed", severity: "info", title: "Document title present", description: "ok", evidence: { kind: "title", present: true, characterCount: 1 } },
      { ruleId: "NO_CONSOLE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No console errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_PAGE_ERRORS", category: "runtime", status: "passed", severity: "info", title: "No page errors", description: "ok", evidence: { kind: "messages", recordedCount: 0, samples: [], samplesTruncated: false } },
      { ruleId: "NO_FAILED_REQUESTS", category: "network", status: "passed", severity: "info", title: "No failed requests", description: "ok", evidence: { kind: "failedRequests", recordedCount: 0, samples: [], samplesTruncated: false } },
    ],
    summary: { critical: 0, warnings: 0, passed: 6, notApplicable: 0 },
  },
};

describe("internal QA evaluation routes", () => {
  it("returns 503 when token is not configured and keeps public API available", async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: "POST", url: "/internal/qa-evaluations", payload: body });
    expect(response.statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });

  it("requires bearer auth, creates idempotently, detects conflicts, and retrieves", async () => {
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, qaEvaluationRepository: new InMemoryQaEvaluationRepository() });
    expect((await app.inject({ method: "POST", url: "/internal/qa-evaluations", payload: body })).statusCode).toBe(401);
    const created = await app.inject({ method: "POST", url: "/internal/qa-evaluations", headers: { authorization: `Bearer ${token}` }, payload: body });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const retry = await app.inject({ method: "POST", url: "/internal/qa-evaluations", headers: { authorization: `Bearer ${token}` }, payload: body });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(id);
    const conflict = await app.inject({ method: "POST", url: "/internal/qa-evaluations", headers: { authorization: `Bearer ${token}` }, payload: { ...body, evaluation: { ...body.evaluation, findings: body.evaluation.findings.map((finding, index) => index === 1 ? { ...finding, description: "different" } : finding) } } });
    expect(conflict.statusCode).toBe(409);
    const fetched = await app.inject({ method: "GET", url: `/internal/qa-evaluations/${id}`, headers: { authorization: `Bearer ${token}` } });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().evaluation.findings).toHaveLength(6);
    expect((await app.inject({ method: "GET", url: "/internal/qa-evaluations/not-a-uuid", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/internal/qa-evaluations/5d41977d-ffb9-4388-af0a-0f74c8ee64ac", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(404);
    await app.close();
  });

  it("rejects URL-only and unknown-field input without scanner/network calls", async () => {
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, qaEvaluationRepository: new InMemoryQaEvaluationRepository() });
    const response = await app.inject({ method: "POST", url: "/internal/qa-evaluations", headers: { authorization: `Bearer ${token}` }, payload: { url: "https://example.com/" } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("maps persisted contract corruption to a generic 500", async () => {
    const repository = new InMemoryQaEvaluationRepository();
    const corruptingRepository = {
      create: repository.create.bind(repository),
      findById: () => { throw new QaEvaluationPersistenceCorruptionError("corrupt"); },
      findByScannerRun: repository.findByScannerRun.bind(repository),
    };
    const app = buildApp({ logger: false, qaEvaluationInternalToken: token, qaEvaluationRepository: corruptingRepository });
    const response = await app.inject({ method: "GET", url: "/internal/qa-evaluations/5d41977d-ffb9-4388-af0a-0f74c8ee64ab", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("INTERNAL_ERROR");
    await app.close();
  });
});
