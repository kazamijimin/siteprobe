import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { scanResponseSchema, type ScanResponse } from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "./db/client.js";
import { scans, type ScanRow } from "./db/schema.js";

export interface ScanRepository {
  create(scan: ScanInput, requestedUrl?: string): Promise<ScanResponse> | ScanResponse;
  findById(id: string): Promise<ScanResponse | undefined> | ScanResponse | undefined;
  list(options: ListScansOptions): Promise<ScanListPage> | ScanListPage;
}

/** Input accepted by repositories; legacy tests/callers may omit the synthetic marker. */
export type ScanInput = Omit<ScanResponse, "provenance"> & { provenance?: "synthetic" };

export type ScanListPosition = {
  createdAt: string;
  id: string;
};

export type ListScansOptions = {
  limit: number;
  before?: ScanListPosition;
  query?: string;
};

export type ScanListPage = {
  items: ScanResponse[];
  nextPosition: ScanListPosition | null;
};

function compareScans(left: ScanResponse, right: ScanResponse): number {
  const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDifference !== 0) {
    return createdDifference;
  }
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function isBeforeCursor(scan: ScanResponse, cursor: ScanListPosition): boolean {
  const scanCreatedAt = Date.parse(scan.createdAt);
  const cursorCreatedAt = Date.parse(cursor.createdAt);
  return scanCreatedAt < cursorCreatedAt
    || (scanCreatedAt === cursorCreatedAt && scan.id < cursor.id);
}

function pageFromItems(items: ScanResponse[], limit: number): ScanListPage {
  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  const last = pageItems.at(-1);
  return {
    items: pageItems,
    nextPosition: hasMore && last
      ? { createdAt: last.createdAt, id: last.id }
      : null,
  };
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}

function searchPredicate(query: string) {
  const pattern = `%${escapeLikePattern(query)}%`;
  return or(
    ilike(scans.normalizedUrl, pattern),
    ilike(scans.requestedUrl, pattern),
  );
}

type StoredScan = {
  scan: ScanResponse;
  requestedUrl: string;
};

export class InMemoryScanRepository implements ScanRepository {
  private readonly scans = new Map<string, StoredScan>();

  create(scan: ScanInput, requestedUrl = scan.url): ScanResponse {
    const stored: ScanResponse = { ...scan, provenance: "synthetic" };
    this.scans.set(stored.id, { scan: stored, requestedUrl });
    return stored;
  }

  findById(id: string): ScanResponse | undefined {
    return this.scans.get(id)?.scan;
  }

  list(options: ListScansOptions): ScanListPage {
    const items = [...this.scans.values()]
      .filter(({ scan, requestedUrl }) => {
        if (!options.query) {
          return true;
        }
        return matchesQuery(scan.url, options.query) || matchesQuery(requestedUrl, options.query);
      })
      .map(({ scan }) => scan)
      .filter((scan) => !options.before || isBeforeCursor(scan, options.before))
      .sort(compareScans);
    return pageFromItems(items, options.limit);
  }
}

function mapScanRow(row: ScanRow): ScanResponse {
  return scanResponseSchema.parse({
    id: row.id,
    provenance: "synthetic",
    url: row.normalizedUrl,
    status: row.status,
    score: row.overallScore,
    summary: {
      critical: row.criticalCount,
      warnings: row.warningCount,
      passed: row.passedCount,
    },
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}

export class PostgresScanRepository implements ScanRepository {
  constructor(private readonly db: SiteProbeDatabase) {}

  async create(scan: ScanInput, requestedUrl = scan.url): Promise<ScanResponse> {
    const [row] = await this.db
      .insert(scans)
      .values({
        id: scan.id,
        requestedUrl,
        normalizedUrl: scan.url,
        status: scan.status,
        overallScore: scan.score,
        criticalCount: scan.summary.critical,
        warningCount: scan.summary.warnings,
        passedCount: scan.summary.passed,
        createdAt: new Date(scan.createdAt),
        completedAt: scan.completedAt ? new Date(scan.completedAt) : null,
      })
      .returning();

    return mapScanRow(row);
  }

  async findById(id: string): Promise<ScanResponse | undefined> {
    const [row] = await this.db.select().from(scans).where(eq(scans.id, id)).limit(1);
    return row ? mapScanRow(row) : undefined;
  }

  async list(options: ListScansOptions): Promise<ScanListPage> {
    const cursor = options.before;
    const cursorDate = cursor ? new Date(cursor.createdAt) : undefined;
    const cursorFilter = cursor && cursorDate
      ? or(
        lt(scans.createdAt, cursorDate),
        and(eq(scans.createdAt, cursorDate), lt(scans.id, cursor.id)),
      )
      : undefined;
    const queryFilter = options.query ? searchPredicate(options.query) : undefined;
    const rows = await this.db
      .select()
      .from(scans)
      .where(and(cursorFilter, queryFilter))
      .orderBy(desc(scans.createdAt), desc(scans.id))
      .limit(options.limit + 1);

    return pageFromItems(rows.map(mapScanRow), options.limit);
  }
}
