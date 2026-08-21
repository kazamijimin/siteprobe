import { randomUUID } from "node:crypto";
import { seoEvaluationSchema, scannerResultSchema, type ScannerResult, type SeoEvaluation } from "@siteprobe/contracts";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "../testing/fixtures.js";
import { runScanWithPageInspector } from "../scan/run-scan.js";
import { collectSeo, type SeoDomSnapshot } from "../seo/collect-seo.js";
import { evaluateSeo } from "../seo/evaluate-seo.js";
import { getSeoFixtureDefinition, type SeoFixtureId } from "./seo-catalog.js";

export type ControlledSeoRunResult = { scannerResult: ScannerResult; seoSnapshot?: SeoDomSnapshot; seo: SeoEvaluation };

export async function runControlledSeoFixture(fixtureId: SeoFixtureId): Promise<ControlledSeoRunResult> {
  const definition = getSeoFixtureDefinition(fixtureId);
  const scanId = randomUUID();
  const url = new URL(definition.path, FIXTURE_URL).toString();
  const run = await runScanWithPageInspector(
    { scanId, url },
    ({ page }) => collectSeo(page),
    { resolver: fixtureResolver, testOnlyRouteHandler: fixtureRouteHandler, limits: definition.limits },
  );
  const scannerResult = scannerResultSchema.parse(run.scannerResult);
  const seoSnapshot = run.inspection;
  return { scannerResult, seoSnapshot, seo: seoEvaluationSchema.parse(evaluateSeo(scannerResult, seoSnapshot)) };
}
