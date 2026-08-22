import type {
  QaCategory,
  QaEvaluation,
  QaEvidence,
  QaFinding,
  QaFindingStatus,
  QaSeverity,
  ScannerResult,
} from "@siteprobe/contracts";

import { boundedText } from "../scan/result.js";

export type { QaCategory, QaEvaluation, QaEvidence, QaFailedRequestEvidence, QaFinding, QaFindingStatus, QaRuleId, QaSeverity } from "@siteprobe/contracts";

type EvaluatorRuleId = QaFinding["ruleId"];

type QaRule = Readonly<{
  ruleId: EvaluatorRuleId;
  category: QaCategory;
  title: string;
}>;

const QA_RULES: readonly QaRule[] = [
  {
    ruleId: "NAVIGATION_COMPLETED",
    category: "navigation",
    title: "Navigation completed",
  },
  {
    ruleId: "HTTP_STATUS_ACCEPTABLE",
    category: "navigation",
    title: "HTTP status acceptable",
  },
  {
    ruleId: "DOCUMENT_TITLE_PRESENT",
    category: "document",
    title: "Document title present",
  },
  {
    ruleId: "NO_CONSOLE_ERRORS",
    category: "runtime",
    title: "No console errors",
  },
  {
    ruleId: "NO_PAGE_ERRORS",
    category: "runtime",
    title: "No uncaught page errors",
  },
  {
    ruleId: "NO_FAILED_REQUESTS",
    category: "network",
    title: "No failed requests",
  },
];

const MAX_EVIDENCE_SAMPLES = 3;

function navigationEvidence(result: ScannerResult): QaEvidence {
  return {
    kind: "navigation",
    navigationSucceeded: result.navigationSucceeded,
    failureCode: result.failureCode ?? null,
    requestedUrl: boundedText(result.requestedUrl, 2048),
    finalUrl: result.finalUrl === null ? null : boundedText(result.finalUrl, 2048),
    navigationDurationMs: result.navigationDurationMs,
  };
}

function messageEvidence(messages: readonly string[]): QaEvidence {
  return {
    kind: "messages",
    recordedCount: messages.length,
    samples: messages
      .slice(0, MAX_EVIDENCE_SAMPLES)
      .map((message) => boundedText(message, 512)),
    samplesTruncated: messages.length > MAX_EVIDENCE_SAMPLES,
  };
}

function failedRequestEvidence(
  requests: ScannerResult["failedRequests"],
): QaEvidence {
  const targetFailureCount = requests.filter((request) => request.attribution !== "SCANNER_POLICY_BLOCK").length;
  const scannerPolicyBlockCount = requests.filter((request) => request.attribution === "SCANNER_POLICY_BLOCK").length;
  return {
    kind: "failedRequests",
    recordedCount: requests.length,
    targetFailureCount,
    scannerPolicyBlockCount,
    samples: requests.slice(0, MAX_EVIDENCE_SAMPLES).map((request) => ({
      url: boundedText(request.url, 512),
      method: boundedText(request.method, 16),
      resourceType: boundedText(request.resourceType, 64),
      failureReason: boundedText(request.failureReason, 256),
      ...(request.attribution ? { attribution: request.attribution } : {}),
    })),
    samplesTruncated: requests.length > MAX_EVIDENCE_SAMPLES,
  };
}

function makeFinding(
  rule: QaRule,
  status: QaFindingStatus,
  severity: QaSeverity,
  description: string,
  evidence: QaEvidence,
): QaFinding {
  return {
    ruleId: rule.ruleId,
    category: rule.category,
    status,
    severity,
    title: rule.title,
    description,
    evidence,
  };
}

function notApplicableFinding(
  rule: QaRule,
  evidence: QaEvidence,
  description = "Navigation was incomplete, so this rule was not evaluated.",
): QaFinding {
  return makeFinding(
    rule,
    "notApplicable",
    "info",
    description,
    evidence,
  );
}

function evaluateRule(
  rule: QaRule,
  result: ScannerResult,
  usableNavigation: boolean,
): QaFinding {
  switch (rule.ruleId) {
    case "NAVIGATION_COMPLETED":
      return result.navigationSucceeded && result.failureCode === undefined
        ? makeFinding(
            rule,
            "passed",
            "info",
            "The scan completed successfully.",
            navigationEvidence(result),
          )
        : makeFinding(
            rule,
            "failed",
            "critical",
            "The scan did not complete successfully.",
            navigationEvidence(result),
          );

    case "HTTP_STATUS_ACCEPTABLE": {
      const evidence: QaEvidence = { kind: "httpStatus", value: result.httpStatus };
      if (!usableNavigation) return notApplicableFinding(rule, evidence);
      if (result.httpStatus === null) {
        return notApplicableFinding(
          rule,
          evidence,
          "No final HTTP status was available for this navigation.",
        );
      }
      if (result.httpStatus >= 200 && result.httpStatus <= 399) {
        return makeFinding(
          rule,
          "passed",
          "info",
          "The final document returned an acceptable HTTP status.",
          evidence,
        );
      }
      return makeFinding(
        rule,
        "failed",
        result.httpStatus >= 500 ? "critical" : "warning",
        "The final document returned an unacceptable HTTP status.",
        evidence,
      );
    }

    case "DOCUMENT_TITLE_PRESENT": {
      const title = result.pageTitle?.trim() ?? "";
      const evidence: QaEvidence = {
        kind: "title",
        present: title.length > 0,
        characterCount: title.length,
      };
      if (!usableNavigation) return notApplicableFinding(rule, evidence);
      return title.length > 0
        ? makeFinding(
            rule,
            "passed",
            "info",
            "The document contains a non-empty title.",
            evidence,
          )
        : makeFinding(
            rule,
            "failed",
            "warning",
            "The document does not contain a non-empty title.",
            evidence,
          );
    }

    case "NO_CONSOLE_ERRORS":
      if (!usableNavigation) return notApplicableFinding(rule, messageEvidence(result.consoleErrors));
      return result.consoleErrors.length === 0
        ? makeFinding(
            rule,
            "passed",
            "info",
            "No error-level console messages were recorded.",
            messageEvidence(result.consoleErrors),
          )
        : makeFinding(
            rule,
            "failed",
            "warning",
            "The page recorded error-level console messages.",
            messageEvidence(result.consoleErrors),
          );

    case "NO_PAGE_ERRORS":
      if (!usableNavigation) return notApplicableFinding(rule, messageEvidence(result.pageErrors));
      return result.pageErrors.length === 0
        ? makeFinding(
            rule,
            "passed",
            "info",
            "No uncaught page runtime errors were recorded.",
            messageEvidence(result.pageErrors),
          )
        : makeFinding(
            rule,
            "failed",
            "critical",
            "The page recorded uncaught runtime errors.",
            messageEvidence(result.pageErrors),
          );

    case "NO_FAILED_REQUESTS":
      if (!usableNavigation) return notApplicableFinding(rule, failedRequestEvidence(result.failedRequests));
      if (result.failedRequests.length > 0 && result.failedRequests.every((request) => request.attribution === "SCANNER_POLICY_BLOCK")) {
        return makeFinding(
          rule,
          "passed",
          "info",
          "No target requests failed; scanner policy blocks were recorded separately.",
          failedRequestEvidence(result.failedRequests),
        );
      }
      return result.failedRequests.length === 0
        ? makeFinding(
            rule,
            "passed",
            "info",
            "No target requests failed.",
            failedRequestEvidence(result.failedRequests),
          )
        : makeFinding(
            rule,
            "failed",
            "warning",
            "One or more target requests failed.",
            failedRequestEvidence(result.failedRequests),
          );
  }
}

function summarize(findings: readonly QaFinding[]): QaEvaluation["summary"] {
  return findings.reduce(
    (summary, finding) => {
      if (finding.status === "passed") summary.passed += 1;
      if (finding.status === "notApplicable") summary.notApplicable += 1;
      if (finding.status === "failed" && finding.severity === "critical") summary.critical += 1;
      if (finding.status === "failed" && finding.severity === "warning") summary.warnings += 1;
      return summary;
    },
    { critical: 0, warnings: 0, passed: 0, notApplicable: 0 },
  );
}

export function evaluateScannerResult(result: ScannerResult): QaEvaluation {
  const usableNavigation = result.navigationSucceeded && result.failureCode === undefined;
  const findings = QA_RULES.map((rule) => evaluateRule(rule, result, usableNavigation));
  return { findings, summary: summarize(findings) };
}
