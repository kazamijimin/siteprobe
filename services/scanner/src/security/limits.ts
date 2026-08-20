export const scannerResourcePolicy = {
  defined: {
    navigationTimeoutMs: 15_000,
    jobTimeoutMs: 30_000,
    actionTimeoutMs: 5_000,
    maxRedirects: 10,
    maxRecordedErrors: 100,
    maxRequests: 500,
    concurrency: 1,
    allowedMethods: ["GET", "HEAD"] as const,
    websockets: "block" as const,
    serviceWorkers: "block" as const,
    popups: "block" as const,
    downloadsAllowed: false,
    dialogs: "dismiss" as const,
    permissions: {
      microphone: "denied",
      camera: "denied",
      geolocation: "denied",
      notifications: "denied",
      clipboard: "denied",
      midi: "denied",
    } as const,
  },
  enforced: {
    urlPolicy: true,
    dnsAndIpClassification: true,
    browserExecution: false,
    requestInterception: false,
    resourceByteLimits: false,
    networkIsolation: false,
  },
} as const;

export type ScannerResourcePolicy = typeof scannerResourcePolicy;
