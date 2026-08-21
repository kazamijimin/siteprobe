import { ControlledEvaluationError } from "./errors.js";

export type ControlledEvaluationToolConfig = {
  apiUrl: URL;
  internalToken: string;
};

function parseApiUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must be a valid URL");
  }

  if (parsed.protocol !== "http:") {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must use http");
  }
  if (parsed.username || parsed.password) {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must not include credentials");
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must use a loopback hostname");
  }
  if (parsed.port && (Number(parsed.port) < 1 || Number(parsed.port) > 65535)) {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must use a valid port");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "SITEPROBE_API_URL must identify an API origin");
  }

  parsed.pathname = "/";
  return parsed;
}

export function loadToolConfig(environment: NodeJS.ProcessEnv = process.env): ControlledEvaluationToolConfig {
  const apiUrl = parseApiUrl(environment.SITEPROBE_API_URL?.trim() || "http://127.0.0.1:3000");
  const internalToken = environment.QA_EVALUATION_INTERNAL_TOKEN?.trim();
  if (!internalToken) {
    throw new ControlledEvaluationError("INVALID_CONFIGURATION", "QA_EVALUATION_INTERNAL_TOKEN is required");
  }
  return { apiUrl, internalToken };
}

export { parseApiUrl };
