export type DatabaseTarget = {
  host: string;
  port: number;
  database: string;
};

const REQUIRED_TEST_TARGET: DatabaseTarget = {
  host: "127.0.0.1",
  port: 5432,
  database: "siteprobe_test",
};

export class TestDatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseSafetyError";
  }
}

function describeTarget(target: DatabaseTarget): string {
  return `host "${target.host}", port ${target.port}, database "${target.database}"`;
}

function parseTarget(value: string, variableName: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TestDatabaseSafetyError(`${variableName} is not a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new TestDatabaseSafetyError(`${variableName} must use the PostgreSQL protocol`);
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new TestDatabaseSafetyError(`${variableName} must include a database name`);
  }

  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
  };
}

function sameTarget(left: DatabaseTarget, right: DatabaseTarget): boolean {
  return left.host === right.host
    && left.port === right.port
    && left.database === right.database;
}

export function assertSafeTestDatabaseUrl(
  testUrl = process.env.SITEPROBE_TEST_DATABASE_URL,
  normalUrl = process.env.DATABASE_URL,
): DatabaseTarget {
  if (!testUrl) {
    throw new TestDatabaseSafetyError("SITEPROBE_TEST_DATABASE_URL is required for PostgreSQL integration tests");
  }

  const testTarget = parseTarget(testUrl, "SITEPROBE_TEST_DATABASE_URL");
  if (testTarget.host !== REQUIRED_TEST_TARGET.host
    || testTarget.port !== REQUIRED_TEST_TARGET.port
    || testTarget.database !== REQUIRED_TEST_TARGET.database) {
    throw new TestDatabaseSafetyError(
      `Unsafe PostgreSQL test target: ${describeTarget(testTarget)} is not the dedicated test target`,
    );
  }

  if (normalUrl) {
    const normalTarget = parseTarget(normalUrl, "DATABASE_URL");
    if (sameTarget(testTarget, normalTarget)) {
      throw new TestDatabaseSafetyError(
        `Unsafe PostgreSQL test target: it matches the normal target (${describeTarget(testTarget)})`,
      );
    }
  }

  return testTarget;
}
