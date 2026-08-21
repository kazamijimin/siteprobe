import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  seoEvaluationCreateSchema,
  seoEvaluationResponseSchema,
  type SeoEvaluationCreate,
  type SeoEvaluationResponse,
} from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "../db/client.js";
import { seoEvaluations, type SeoEvaluationRow } from "../db/schema.js";

export class SeoEvaluationPersistenceCorruptionError extends Error {
  readonly code = "SEO_EVALUATION_PERSISTENCE_CORRUPTION";
  constructor(message: string, options?: { cause?: unknown }) { super(message, options); this.name = "SeoEvaluationPersistenceCorruptionError"; }
}
export class SeoEvaluationConflictError extends Error {
  readonly code = "SEO_EVALUATION_CONFLICT";
  constructor(message = "An SEO evaluation already exists for this scanner run and evaluator version") { super(message); this.name = "SeoEvaluationConflictError"; }
}

export interface SeoEvaluationRepository {
  create(input: SeoEvaluationCreate): Promise<{ evaluation: SeoEvaluationResponse; created: boolean }> | { evaluation: SeoEvaluationResponse; created: boolean };
  findById(id: string): Promise<SeoEvaluationResponse | undefined> | SeoEvaluationResponse | undefined;
  findByScannerRun(scannerRunId: string, evaluatorVersion: number): Promise<SeoEvaluationResponse | undefined> | SeoEvaluationResponse | undefined;
}

function normalizeInput(input: SeoEvaluationCreate): string {
  const parsed = seoEvaluationCreateSchema.parse(input);
  return JSON.stringify({ ...parsed, scannedAt: new Date(parsed.scannedAt).toISOString() });
}
function toResponse(row: SeoEvaluationRow): SeoEvaluationResponse {
  try {
    return seoEvaluationResponseSchema.parse({
      id: row.id, source: row.source, schemaVersion: row.schemaVersion, evaluatorVersion: row.evaluatorVersion,
      scannerRunId: row.scannerRunId, requestedUrl: row.requestedUrl, finalUrl: row.finalUrl,
      scannedAt: row.scannedAt.toISOString(), evaluation: row.evaluationJson, createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    throw new SeoEvaluationPersistenceCorruptionError("Stored SEO evaluation failed contract validation", { cause: error });
  }
}
function rowFromInput(input: SeoEvaluationCreate, id: string, createdAt: Date) {
  return { id, scannerRunId: input.scannerRunId, source: "controlled-scanner" as const, schemaVersion: input.schemaVersion, evaluatorVersion: input.evaluatorVersion, requestedUrl: input.requestedUrl, finalUrl: input.finalUrl, scannedAt: new Date(input.scannedAt), evaluationJson: input.evaluation, createdAt };
}
function comparable(response: SeoEvaluationResponse): SeoEvaluationCreate {
  return seoEvaluationCreateSchema.parse({ schemaVersion: response.schemaVersion, evaluatorVersion: response.evaluatorVersion, scannerRunId: response.scannerRunId, requestedUrl: response.requestedUrl, finalUrl: response.finalUrl, scannedAt: response.scannedAt, evaluation: response.evaluation });
}

export class InMemorySeoEvaluationRepository implements SeoEvaluationRepository {
  private readonly rows = new Map<string, SeoEvaluationRow>();
  private readonly byComposite = new Map<string, string>();
  create(input: SeoEvaluationCreate) {
    const parsed = seoEvaluationCreateSchema.parse(structuredClone(input));
    const key = `${parsed.scannerRunId}:${parsed.evaluatorVersion}`;
    const existingId = this.byComposite.get(key);
    if (existingId) {
      const existing = this.rows.get(existingId);
      if (!existing) throw new SeoEvaluationPersistenceCorruptionError("SEO evaluation composite index is inconsistent");
      const response = toResponse(existing);
      if (normalizeInput(comparable(response)) !== normalizeInput(parsed)) throw new SeoEvaluationConflictError();
      return { evaluation: response, created: false };
    }
    const row = rowFromInput(parsed, randomUUID(), new Date());
    this.rows.set(row.id, row); this.byComposite.set(key, row.id);
    return { evaluation: toResponse(row), created: true };
  }
  findById(id: string) { const row = this.rows.get(id); return row ? toResponse(row) : undefined; }
  findByScannerRun(scannerRunId: string, evaluatorVersion: number) { const id = this.byComposite.get(`${scannerRunId}:${evaluatorVersion}`); return id ? this.findById(id) : undefined; }
}

export class PostgresSeoEvaluationRepository implements SeoEvaluationRepository {
  constructor(private readonly db: SiteProbeDatabase) {}
  async create(input: SeoEvaluationCreate) {
    const parsed = seoEvaluationCreateSchema.parse(structuredClone(input));
    const id = randomUUID();
    try {
      const inserted = await this.db.insert(seoEvaluations).values(rowFromInput(parsed, id, new Date())).onConflictDoNothing({ target: [seoEvaluations.scannerRunId, seoEvaluations.evaluatorVersion] }).returning();
      if (inserted[0]) return { evaluation: toResponse(inserted[0]), created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    const existing = await this.findByScannerRun(parsed.scannerRunId, parsed.evaluatorVersion);
    if (!existing) throw new SeoEvaluationPersistenceCorruptionError("SEO evaluation conflict occurred but existing row could not be loaded");
    if (normalizeInput(comparable(existing)) !== normalizeInput(parsed)) throw new SeoEvaluationConflictError();
    return { evaluation: existing, created: false };
  }
  async findById(id: string) {
    const rows = await this.db.select().from(seoEvaluations).where(eq(seoEvaluations.id, id)).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }
  async findByScannerRun(scannerRunId: string, evaluatorVersion: number) {
    const rows = await this.db.select().from(seoEvaluations).where(and(eq(seoEvaluations.scannerRunId, scannerRunId), eq(seoEvaluations.evaluatorVersion, evaluatorVersion))).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }
}
