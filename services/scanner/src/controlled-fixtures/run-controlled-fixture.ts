import { randomUUID } from "node:crypto";
import type { ScannerResult } from "@siteprobe/contracts";
import { fixtureResolver, fixtureRouteHandler, FIXTURE_URL } from "../testing/fixtures.js";
import { runScan } from "../scan/run-scan.js";
import { getControlledFixtureDefinition, type ControlledFixtureId } from "./catalog.js";

export async function runControlledFixture(fixtureId: ControlledFixtureId): Promise<ScannerResult> {
  const definition = getControlledFixtureDefinition(fixtureId);
  const scanId = randomUUID();
  const url = new URL(definition.path, FIXTURE_URL).toString();

  return runScan(
    { scanId, url },
    {
      resolver: fixtureResolver,
      testOnlyRouteHandler: fixtureRouteHandler,
      limits: definition.limits,
    },
  );
}
