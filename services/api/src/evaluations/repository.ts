import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import {
  controlledQaEvaluationCreateSchema,
  controlledQaEvaluationResponseSchema,
  type ControlledQaEvaluationCreate,
  type ControlledQaEvaluationResponse,
} from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "../db/client.js";
import { qaEvaluations, type QaEvaluationRow } from "../db/schema.js";

export class QaEvaluationPersistenceCorruptionError extends Error {
  readonly code = "QA_EVALUATION_PERSISTENCE_CORRUPTION";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QaEvaluationPersistenceCorruptionError";
  }
}

export class QaEvaluationConflictError extends Error {
  readonly code = "QA_EVALUATION_CONFLICT";
  constructor(message = "An evaluation already exists for this scanner run and evaluator version") {
    super(message);
    this.name = "QaEvaluationConflictError";
  }
}

export type QaEvaluationListPosition = {
  createdAt: string;
  id: string;
};

export type ListQaEvaluationsOptions = {
  limit: number;
  before?: QaEvaluationListPosition;
};

export type QaEvaluationListPage = {
  evaluations: ControlledQaEvaluationResponse[];
  nextPosition: QaEvaluationListPosition | null;
};

export interface QaEvaluationRepository {
  create(input: ControlledQaEvaluationCreate): Promise<{ evaluation: ControlledQaEvaluationResponse; created: boolean }> | { evaluation: ControlledQaEvaluationResponse; created: boolean };
  findById(id: string): Promise<ControlledQaEvaluationResponse | undefined> | ControlledQaEvaluationResponse | undefined;
  findByScannerRun(scannerRunId: string, evaluatorVersion: number): Promise<ControlledQaEvaluationResponse | undefined> | ControlledQaEvaluationResponse | undefined;
  list(options: ListQaEvaluationsOptions): Promise<QaEvaluationListPage> | QaEvaluationListPage;
}

function normalizeInput(input: ControlledQaEvaluationCreate): string {
  const parsed = controlledQaEvaluationCreateSchema.parse(input);
  return JSON.stringify({ ...parsed, scannedAt: new Date(parsed.scannedAt).toISOString() });
}

function toResponse(row: QaEvaluationRow): ControlledQaEvaluationResponse {
  try {
    return controlledQaEvaluationResponseSchema.parse({
      id: row.id,
      source: row.source,
      schemaVersion: row.schemaVersion,
      evaluatorVersion: row.evaluatorVersion,
      scannerRunId: row.scannerRunId,
      requestedUrl: row.requestedUrl,
      finalUrl: row.finalUrl,
      scannedAt: row.scannedAt.toISOString(),
      evaluation: row.evaluationJson,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    throw new QaEvaluationPersistenceCorruptionError("Stored QA evaluation failed contract validation", { cause: error });
  }
}

function rowFromInput(input: ControlledQaEvaluationCreate, id: string, createdAt: Date) {
  return {
    id,
    scannerRunId: input.scannerRunId,
    source: "controlled-scanner" as const,
    schemaVersion: input.schemaVersion,
    evaluatorVersion: input.evaluatorVersion,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    scannedAt: new Date(input.scannedAt),
    evaluationJson: input.evaluation,
    createdAt,
  };
}

function compareRows(left: QaEvaluationRow, right: QaEvaluationRow): number {
  const createdDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function isBeforeCursor(row: QaEvaluationRow, cursor: QaEvaluationListPosition): boolean {
  const rowCreatedAt = row.createdAt.getTime();
  const cursorCreatedAt = Date.parse(cursor.createdAt);
  return rowCreatedAt < cursorCreatedAt
    || (rowCreatedAt === cursorCreatedAt && row.id < cursor.id);
}

function pageFromResponses(
  responses: ControlledQaEvaluationResponse[],
  limit: number,
): QaEvaluationListPage {
  const hasMore = responses.length > limit;
  const evaluations = responses.slice(0, limit);
  const last = evaluations.at(-1);
  return {
    evaluations,
    nextPosition: hasMore && last
      ? { createdAt: last.createdAt, id: last.id }
      : null,
  };
}

export class InMemoryQaEvaluationRepository implements QaEvaluationRepository {
  private readonly rows = new Map<string, QaEvaluationRow>();
  private readonly byComposite = new Map<string, string>();

  create(input: ControlledQaEvaluationCreate) {
    const parsed = controlledQaEvaluationCreateSchema.parse(structuredClone(input));
    const key = `${parsed.scannerRunId}:${parsed.evaluatorVersion}`;
    const existingId = this.byComposite.get(key);
    if (existingId) {
      const existing = this.rows.get(existingId);
      if (!existing) throw new QaEvaluationPersistenceCorruptionError("Evaluation composite index is inconsistent");
      const response = toResponse(existing);
      const existingInput = {
        schemaVersion: response.schemaVersion,
        evaluatorVersion: response.evaluatorVersion,
        scannerRunId: response.scannerRunId,
        requestedUrl: response.requestedUrl,
        finalUrl: response.finalUrl,
        scannedAt: response.scannedAt,
        evaluation: response.evaluation,
      };
      if (normalizeInput(existingInput) !== normalizeInput(parsed)) throw new QaEvaluationConflictError();
      return { evaluation: response, created: false };
    }
    const id = randomUUID();
    const createdAt = new Date();
    const row = rowFromInput(parsed, id, createdAt);
    this.rows.set(id, row);
    this.byComposite.set(key, id);
    return { evaluation: toResponse(row), created: true };
  }

  findById(id: string) {
    const row = this.rows.get(id);
    return row ? toResponse(row) : undefined;
  }

  findByScannerRun(scannerRunId: string, evaluatorVersion: number) {
    const id = this.byComposite.get(`${scannerRunId}:${evaluatorVersion}`);
    return id ? this.findById(id) : undefined;
  }

  list(options: ListQaEvaluationsOptions): QaEvaluationListPage {
    const rows = [...this.rows.values()]
      .filter((row) => !options.before || isBeforeCursor(row, options.before))
      .sort(compareRows)
      .slice(0, options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}

export class PostgresQaEvaluationRepository implements QaEvaluationRepository {
  constructor(private readonly db: SiteProbeDatabase) {}

  async create(input: ControlledQaEvaluationCreate) {
    const parsed = controlledQaEvaluationCreateSchema.parse(structuredClone(input));
    const id = randomUUID();
    try {
      const inserted = await this.db.insert(qaEvaluations).values(rowFromInput(parsed, id, new Date())).onConflictDoNothing({
        target: [qaEvaluations.scannerRunId, qaEvaluations.evaluatorVersion],
      }).returning();
      if (inserted[0]) return { evaluation: toResponse(inserted[0]), created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    const existing = await this.findByScannerRun(parsed.scannerRunId, parsed.evaluatorVersion);
    if (!existing) throw new QaEvaluationPersistenceCorruptionError("Evaluation conflict occurred but existing row could not be loaded");
    const existingInput = {
      schemaVersion: existing.schemaVersion,
      evaluatorVersion: existing.evaluatorVersion,
      scannerRunId: existing.scannerRunId,
      requestedUrl: existing.requestedUrl,
      finalUrl: existing.finalUrl,
      scannedAt: existing.scannedAt,
      evaluation: existing.evaluation,
    };
    if (normalizeInput(existingInput) !== normalizeInput(parsed)) throw new QaEvaluationConflictError();
    return { evaluation: existing, created: false };
  }

  async findById(id: string) {
    const rows = await this.db.select().from(qaEvaluations).where(eq(qaEvaluations.id, id)).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }

  async findByScannerRun(scannerRunId: string, evaluatorVersion: number) {
    const rows = await this.db.select().from(qaEvaluations).where(and(
      eq(qaEvaluations.scannerRunId, scannerRunId),
      eq(qaEvaluations.evaluatorVersion, evaluatorVersion),
    )).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }

  async list(options: ListQaEvaluationsOptions): Promise<QaEvaluationListPage> {
    const cursorDate = options.before ? new Date(options.before.createdAt) : undefined;
    const cursorFilter = options.before && cursorDate
      ? or(
        lt(qaEvaluations.createdAt, cursorDate),
        and(eq(qaEvaluations.createdAt, cursorDate), lt(qaEvaluations.id, options.before.id)),
      )
      : undefined;
    const query = this.db.select().from(qaEvaluations);
    const rows = cursorFilter
      ? await query
        .where(cursorFilter)
        .orderBy(desc(qaEvaluations.createdAt), desc(qaEvaluations.id))
        .limit(options.limit + 1)
      : await query
        .orderBy(desc(qaEvaluations.createdAt), desc(qaEvaluations.id))
        .limit(options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}
