import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import {
  seoEvaluationCreateSchema,
  seoEvaluationResponseSchema,
  type SeoEvaluationCreate,
  type SeoEvaluationResponse,
} from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "../db/client.js";
import { seoEvaluations, type SeoEvaluationRow } from "../db/schema.js";
import { readStoredEvaluation, resolveControlledProvenance, storedEvaluation } from "../evaluations/provenance.js";

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
  list(options: ListSeoEvaluationsOptions): Promise<SeoEvaluationListPage> | SeoEvaluationListPage;
}

export type SeoEvaluationListPosition = { createdAt: string; id: string };
export type ListSeoEvaluationsOptions = { limit: number; before?: SeoEvaluationListPosition };
export type SeoEvaluationListPage = { evaluations: SeoEvaluationResponse[]; nextPosition: SeoEvaluationListPosition | null };

function normalizeInput(input: SeoEvaluationCreate): string {
  const parsed = seoEvaluationCreateSchema.parse(input);
  return JSON.stringify({ ...parsed, scannedAt: new Date(parsed.scannedAt).toISOString() });
}
function toResponse(row: SeoEvaluationRow): SeoEvaluationResponse {
  try {
    const stored = readStoredEvaluation<SeoEvaluationCreate["evaluation"]>(row.evaluationJson, row.requestedUrl);
    return seoEvaluationResponseSchema.parse({
      id: row.id, source: row.source, provenance: stored.provenance, schemaVersion: row.schemaVersion, evaluatorVersion: row.evaluatorVersion,
      scannerRunId: row.scannerRunId, requestedUrl: row.requestedUrl, finalUrl: row.finalUrl,
      scannedAt: row.scannedAt.toISOString(), evaluation: stored.evaluation, createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    throw new SeoEvaluationPersistenceCorruptionError("Stored SEO evaluation failed contract validation", { cause: error });
  }
}
function rowFromInput(input: SeoEvaluationCreate, id: string, createdAt: Date) {
  return { id, scannerRunId: input.scannerRunId, source: "controlled-scanner" as const, schemaVersion: input.schemaVersion, evaluatorVersion: input.evaluatorVersion, requestedUrl: input.requestedUrl, finalUrl: input.finalUrl, scannedAt: new Date(input.scannedAt), evaluationJson: storedEvaluation(input.evaluation, input.provenance ?? "legacy-unknown"), createdAt };
}
function comparable(response: SeoEvaluationResponse): SeoEvaluationCreate {
  return seoEvaluationCreateSchema.parse({ provenance: response.provenance, schemaVersion: response.schemaVersion, evaluatorVersion: response.evaluatorVersion, scannerRunId: response.scannerRunId, requestedUrl: response.requestedUrl, finalUrl: response.finalUrl, scannedAt: response.scannedAt, evaluation: response.evaluation });
}

function compareRows(left: SeoEvaluationRow, right: SeoEvaluationRow): number {
  const createdDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function isBeforeCursor(row: SeoEvaluationRow, cursor: SeoEvaluationListPosition): boolean {
  const rowCreatedAt = row.createdAt.getTime();
  const cursorCreatedAt = Date.parse(cursor.createdAt);
  return rowCreatedAt < cursorCreatedAt || (rowCreatedAt === cursorCreatedAt && row.id < cursor.id);
}

function pageFromResponses(responses: SeoEvaluationResponse[], limit: number): SeoEvaluationListPage {
  const hasMore = responses.length > limit;
  const evaluations = responses.slice(0, limit);
  const last = evaluations.at(-1);
  return { evaluations, nextPosition: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null };
}

export class InMemorySeoEvaluationRepository implements SeoEvaluationRepository {
  private readonly rows = new Map<string, SeoEvaluationRow>();
  private readonly byComposite = new Map<string, string>();
  create(input: SeoEvaluationCreate) {
    const parsed = seoEvaluationCreateSchema.parse({ ...structuredClone(input), provenance: resolveControlledProvenance(input.provenance, input.requestedUrl) });
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
  list(options: ListSeoEvaluationsOptions): SeoEvaluationListPage {
    const rows = [...this.rows.values()]
      .filter((row) => !options.before || isBeforeCursor(row, options.before))
      .sort(compareRows)
      .slice(0, options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}

export class PostgresSeoEvaluationRepository implements SeoEvaluationRepository {
  constructor(private readonly db: SiteProbeDatabase) {}
  async create(input: SeoEvaluationCreate) {
    const parsed = seoEvaluationCreateSchema.parse({ ...structuredClone(input), provenance: resolveControlledProvenance(input.provenance, input.requestedUrl) });
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

  async list(options: ListSeoEvaluationsOptions): Promise<SeoEvaluationListPage> {
    const cursorDate = options.before ? new Date(options.before.createdAt) : undefined;
    const cursorFilter = options.before && cursorDate
      ? or(
          lt(seoEvaluations.createdAt, cursorDate),
          and(eq(seoEvaluations.createdAt, cursorDate), lt(seoEvaluations.id, options.before.id)),
        )
      : undefined;
    const query = this.db.select().from(seoEvaluations);
    const rows = cursorFilter
      ? await query.where(cursorFilter).orderBy(desc(seoEvaluations.createdAt), desc(seoEvaluations.id)).limit(options.limit + 1)
      : await query.orderBy(desc(seoEvaluations.createdAt), desc(seoEvaluations.id)).limit(options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}
