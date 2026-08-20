import { timingSafeEqual } from "node:crypto";

export function hasValidBearerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorizationHeader.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
