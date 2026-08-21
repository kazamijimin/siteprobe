import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import {
  accessibilityEvaluationCreateSchema,
  accessibilityEvaluationResponseSchema,
  type AccessibilityEvaluationCreate,
  type AccessibilityEvaluationResponse,
} from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "../db/client.js";
import { accessibilityEvaluations, type AccessibilityEvaluationRow } from "../db/schema.js";

export class AccessibilityEvaluationPersistenceCorruptionError extends Error {
  readonly code = "ACCESSIBILITY_EVALUATION_PERSISTENCE_CORRUPTION";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AccessibilityEvaluationPersistenceCorruptionError";
  }
}

export class AccessibilityEvaluationConflictError extends Error {
  readonly code = "ACCESSIBILITY_EVALUATION_CONFLICT";
  constructor(message = "An accessibility evaluation already exists for this scanner run and engine version") {
    super(message);
    this.name = "AccessibilityEvaluationConflictError";
  }
}

export interface AccessibilityEvaluationRepository {
  create(input: AccessibilityEvaluationCreate): Promise<{ evaluation: AccessibilityEvaluationResponse; created: boolean }> | { evaluation: AccessibilityEvaluationResponse; created: boolean };
  findById(id: string): Promise<AccessibilityEvaluationResponse | undefined> | AccessibilityEvaluationResponse | undefined;
  findByScannerRun(scannerRunId: string, evaluatorVersion: number, engineVersion: string): Promise<AccessibilityEvaluationResponse | undefined> | AccessibilityEvaluationResponse | undefined;
  list(options: ListAccessibilityEvaluationsOptions): Promise<AccessibilityEvaluationListPage> | AccessibilityEvaluationListPage;
}

export type AccessibilityEvaluationListPosition = {
  createdAt: string;
  id: string;
};

export type ListAccessibilityEvaluationsOptions = {
  limit: number;
  before?: AccessibilityEvaluationListPosition;
};

export type AccessibilityEvaluationListPage = {
  evaluations: AccessibilityEvaluationResponse[];
  nextPosition: AccessibilityEvaluationListPosition | null;
};

function normalizeInput(input: AccessibilityEvaluationCreate): string {
  const parsed = accessibilityEvaluationCreateSchema.parse(input);
  return JSON.stringify({ ...parsed, scannedAt: new Date(parsed.scannedAt).toISOString() });
}

function storedJson(input: AccessibilityEvaluationCreate) {
  return {
    evaluation: input.evaluation,
    adapter: input.adapter,
    adapterVersion: input.adapterVersion,
    rulesetTags: input.rulesetTags,
  };
}

function toResponse(row: AccessibilityEvaluationRow): AccessibilityEvaluationResponse {
  try {
    const stored = row.evaluationJson;
    return accessibilityEvaluationResponseSchema.parse({
      id: row.id,
      source: row.source,
      schemaVersion: row.schemaVersion,
      evaluatorVersion: row.evaluatorVersion,
      scannerRunId: row.scannerRunId,
      requestedUrl: row.requestedUrl,
      finalUrl: row.finalUrl,
      scannedAt: row.scannedAt.toISOString(),
      engine: row.engine,
      engineVersion: row.engineVersion,
      adapter: stored.adapter,
      adapterVersion: stored.adapterVersion,
      rulesetTags: stored.rulesetTags,
      evaluation: stored.evaluation,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    throw new AccessibilityEvaluationPersistenceCorruptionError("Stored accessibility evaluation failed contract validation", { cause: error });
  }
}

function rowFromInput(input: AccessibilityEvaluationCreate, id: string, createdAt: Date) {
  return {
    id,
    scannerRunId: input.scannerRunId,
    source: "controlled-scanner" as const,
    schemaVersion: input.schemaVersion,
    evaluatorVersion: input.evaluatorVersion,
    engine: input.engine,
    engineVersion: input.engineVersion,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    scannedAt: new Date(input.scannedAt),
    evaluationJson: storedJson(input),
    createdAt,
  };
}

function compositeKey(input: { scannerRunId: string; evaluatorVersion: number; engineVersion: string }): string {
  return `${input.scannerRunId}:${input.evaluatorVersion}:${input.engineVersion}`;
}

function comparableInput(response: AccessibilityEvaluationResponse): AccessibilityEvaluationCreate {
  return accessibilityEvaluationCreateSchema.parse({
    schemaVersion: response.schemaVersion,
    evaluatorVersion: response.evaluatorVersion,
    scannerRunId: response.scannerRunId,
    requestedUrl: response.requestedUrl,
    finalUrl: response.finalUrl,
    scannedAt: response.scannedAt,
    engine: response.engine,
    engineVersion: response.engineVersion,
    adapter: response.adapter,
    adapterVersion: response.adapterVersion,
    rulesetTags: response.rulesetTags,
    evaluation: response.evaluation,
  });
}

function compareRows(left: AccessibilityEvaluationRow, right: AccessibilityEvaluationRow): number {
  const createdDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function isBeforeCursor(row: AccessibilityEvaluationRow, cursor: AccessibilityEvaluationListPosition): boolean {
  const rowCreatedAt = row.createdAt.getTime();
  const cursorCreatedAt = Date.parse(cursor.createdAt);
  return rowCreatedAt < cursorCreatedAt
    || (rowCreatedAt === cursorCreatedAt && row.id < cursor.id);
}

function pageFromResponses(
  responses: AccessibilityEvaluationResponse[],
  limit: number,
): AccessibilityEvaluationListPage {
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

export class InMemoryAccessibilityEvaluationRepository implements AccessibilityEvaluationRepository {
  private readonly rows = new Map<string, AccessibilityEvaluationRow>();
  private readonly byComposite = new Map<string, string>();

  create(input: AccessibilityEvaluationCreate) {
    const parsed = accessibilityEvaluationCreateSchema.parse(structuredClone(input));
    const key = compositeKey(parsed);
    const existingId = this.byComposite.get(key);
    if (existingId) {
      const existing = this.rows.get(existingId);
      if (!existing) throw new AccessibilityEvaluationPersistenceCorruptionError("Accessibility evaluation composite index is inconsistent");
      const response = toResponse(existing);
      if (normalizeInput(comparableInput(response)) !== normalizeInput(parsed)) throw new AccessibilityEvaluationConflictError();
      return { evaluation: response, created: false };
    }
    const id = randomUUID();
    const row = rowFromInput(parsed, id, new Date());
    this.rows.set(id, row);
    this.byComposite.set(key, id);
    return { evaluation: toResponse(row), created: true };
  }

  findById(id: string) {
    const row = this.rows.get(id);
    return row ? toResponse(row) : undefined;
  }

  findByScannerRun(scannerRunId: string, evaluatorVersion: number, engineVersion: string) {
    const id = this.byComposite.get(compositeKey({ scannerRunId, evaluatorVersion, engineVersion }));
    return id ? this.findById(id) : undefined;
  }

  list(options: ListAccessibilityEvaluationsOptions): AccessibilityEvaluationListPage {
    const rows = [...this.rows.values()]
      .filter((row) => !options.before || isBeforeCursor(row, options.before))
      .sort(compareRows)
      .slice(0, options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}

export class PostgresAccessibilityEvaluationRepository implements AccessibilityEvaluationRepository {
  constructor(private readonly db: SiteProbeDatabase) {}

  async create(input: AccessibilityEvaluationCreate) {
    const parsed = accessibilityEvaluationCreateSchema.parse(structuredClone(input));
    const id = randomUUID();
    try {
      const inserted = await this.db.insert(accessibilityEvaluations).values(rowFromInput(parsed, id, new Date())).onConflictDoNothing({
        target: [accessibilityEvaluations.scannerRunId, accessibilityEvaluations.evaluatorVersion, accessibilityEvaluations.engineVersion],
      }).returning();
      if (inserted[0]) return { evaluation: toResponse(inserted[0]), created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    const existing = await this.findByScannerRun(parsed.scannerRunId, parsed.evaluatorVersion, parsed.engineVersion);
    if (!existing) throw new AccessibilityEvaluationPersistenceCorruptionError("Accessibility evaluation conflict occurred but existing row could not be loaded");
    if (normalizeInput(comparableInput(existing)) !== normalizeInput(parsed)) throw new AccessibilityEvaluationConflictError();
    return { evaluation: existing, created: false };
  }

  async findById(id: string) {
    const rows = await this.db.select().from(accessibilityEvaluations).where(eq(accessibilityEvaluations.id, id)).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }

  async findByScannerRun(scannerRunId: string, evaluatorVersion: number, engineVersion: string) {
    const rows = await this.db.select().from(accessibilityEvaluations).where(and(
      eq(accessibilityEvaluations.scannerRunId, scannerRunId),
      eq(accessibilityEvaluations.evaluatorVersion, evaluatorVersion),
      eq(accessibilityEvaluations.engineVersion, engineVersion),
    )).limit(1);
    return rows[0] ? toResponse(rows[0]) : undefined;
  }

  async list(options: ListAccessibilityEvaluationsOptions): Promise<AccessibilityEvaluationListPage> {
    const cursorDate = options.before ? new Date(options.before.createdAt) : undefined;
    const cursorFilter = options.before && cursorDate
      ? or(
        lt(accessibilityEvaluations.createdAt, cursorDate),
        and(eq(accessibilityEvaluations.createdAt, cursorDate), lt(accessibilityEvaluations.id, options.before.id)),
      )
      : undefined;
    const query = this.db.select().from(accessibilityEvaluations);
    const rows = cursorFilter
      ? await query
        .where(cursorFilter)
        .orderBy(desc(accessibilityEvaluations.createdAt), desc(accessibilityEvaluations.id))
        .limit(options.limit + 1)
      : await query
        .orderBy(desc(accessibilityEvaluations.createdAt), desc(accessibilityEvaluations.id))
        .limit(options.limit + 1);
    return pageFromResponses(rows.map(toResponse), options.limit);
  }
}
