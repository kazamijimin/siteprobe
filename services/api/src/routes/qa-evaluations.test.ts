import { describe, expect, it, vi } from "vitest";
import type { ControlledQaEvaluationCreate } from "@siteprobe/contracts";
import { buildApp } from "../app.js";
import { InMemoryQaEvaluationRepository, QaEvaluationPersistenceCorruptionError, type QaEvaluationRepository } from "../evaluations/repository.js";

const token = "qa-test-token-which-is-long-enough";
const body: ControlledQaEvaluationCreate = {
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

describe("development-gated public QA evaluation route", () => {
  function repositoryWithBody() {
    const source = new InMemoryQaEvaluationRepository();
    const created = source.create(body).evaluation;
    const repository: QaEvaluationRepository = {
      create: vi.fn(source.create.bind(source)),
      findById: vi.fn(source.findById.bind(source)),
      findByScannerRun: vi.fn(source.findByScannerRun.bind(source)),
    };
    return { created, repository };
  }

  it("returns 404 before repository access when the flag is absent or false", async () => {
    const { created, repository } = repositoryWithBody();
    const scannerCalls = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const enabled of [undefined, false]) {
      const app = buildApp({
        logger: false,
        qaEvaluationRepository: repository,
        qaEvaluationPublicReadEnabled: enabled,
        scannerClient: { scan: scannerCalls },
      });
      const response = await app.inject({ method: "GET", url: `/api/qa-evaluations/${created.id}` });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
      expect(response.headers["cache-control"]).toBe("no-store");
      await app.close();
    }

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.findByScannerRun).not.toHaveBeenCalled();
    expect(scannerCalls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns a validated projection and performs only one repository read", async () => {
    const { created, repository } = repositoryWithBody();
    const scannerCalls = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const app = buildApp({
      logger: false,
      qaEvaluationRepository: repository,
      qaEvaluationPublicReadEnabled: true,
      scannerClient: { scan: scannerCalls },
    });

    const response = await app.inject({ method: "GET", url: `/api/qa-evaluations/${created.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      id: created.id,
      source: "controlled-scanner",
      schemaVersion: 1,
      evaluatorVersion: 1,
      requestedUrl: created.requestedUrl,
      finalUrl: created.finalUrl,
      scannedAt: created.scannedAt,
      evaluation: created.evaluation,
      createdAt: created.createdAt,
    });
    expect(response.json()).not.toHaveProperty("scannerRunId");
    expect(response.json()).not.toHaveProperty("score");
    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.findByScannerRun).not.toHaveBeenCalled();
    expect(scannerCalls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
    vi.unstubAllGlobals();
  });

  it("validates IDs, reports missing records, and hides persisted corruption", async () => {
    const { created, repository } = repositoryWithBody();
    const app = buildApp({ logger: false, qaEvaluationRepository: repository, qaEvaluationPublicReadEnabled: true });

    const invalid = await app.inject({ method: "GET", url: "/api/qa-evaluations/not-a-uuid" });
    expect(invalid.statusCode).toBe(400);
    expect(repository.findById).toHaveBeenCalledTimes(0);

    const missing = await app.inject({ method: "GET", url: "/api/qa-evaluations/5d41977d-ffb9-4388-af0a-0f74c8ee64ac" });
    expect(missing.statusCode).toBe(404);

    const corruptingRepository: QaEvaluationRepository = {
      create: repository.create,
      findById: () => { throw new QaEvaluationPersistenceCorruptionError("corrupt"); },
      findByScannerRun: repository.findByScannerRun,
    };
    const corruptApp = buildApp({ logger: false, qaEvaluationRepository: corruptingRepository, qaEvaluationPublicReadEnabled: true });
    const corrupt = await corruptApp.inject({ method: "GET", url: `/api/qa-evaluations/${created.id}` });
    expect(corrupt.statusCode).toBe(500);
    expect(corrupt.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "INTERNAL_ERROR" }) }));

    await app.close();
    await corruptApp.close();
  });
});
