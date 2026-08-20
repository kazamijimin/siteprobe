import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL is required")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
      } catch {
        return false;
      }
    }, "DATABASE_URL must be a PostgreSQL connection URL"),
});

export type ApiConfig = {
  host: string;
  port: number;
  databaseUrl: string;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = environmentSchema.parse(environment);
  return { host: parsed.HOST, port: parsed.PORT, databaseUrl: parsed.DATABASE_URL };
}
