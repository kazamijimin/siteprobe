import { eq } from "drizzle-orm";
import { scanResponseSchema, type ScanResponse } from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "./db/client.js";
import { scans, type ScanRow } from "./db/schema.js";

export interface ScanRepository {
  create(scan: ScanResponse, requestedUrl?: string): Promise<ScanResponse> | ScanResponse;
  findById(id: string): Promise<ScanResponse | undefined> | ScanResponse | undefined;
}

export class InMemoryScanRepository implements ScanRepository {
  private readonly scans = new Map<string, ScanResponse>();

  create(scan: ScanResponse): ScanResponse {
    this.scans.set(scan.id, scan);
    return scan;
  }

  findById(id: string): ScanResponse | undefined {
    return this.scans.get(id);
  }
}

function mapScanRow(row: ScanRow): ScanResponse {
  return scanResponseSchema.parse({
    id: row.id,
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

  async create(scan: ScanResponse, requestedUrl = scan.url): Promise<ScanResponse> {
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
}
