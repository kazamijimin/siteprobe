import type { FastifyPluginAsync } from "fastify";
import type { ScannerConfig } from "../config.js";
import { IsolationGate } from "../isolation/gate.js";

export function readinessRoutes(config: ScannerConfig, gate: IsolationGate): FastifyPluginAsync {
  return async (app) => {
    app.get("/ready", async (_request, reply) => {
      const readiness = gate.readiness(config.executionMode);
      if (!readiness.ready) {
        reply.code(503).send({ status: "not-ready", reason: readiness.reason });
        return;
      }
      reply.send({ status: "ready" });
    });
  };
}
