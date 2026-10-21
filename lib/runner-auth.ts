import { timingSafeEqual } from "node:crypto";

/**
 * Runner token (enc-29d7943d): the host runner (PI_WEB_ROLE=runner) accepts
 * requests only with this token. The stateless API container adds it on every
 * proxied request; a browser must never be able to inject it, so the proxy
 * strips any incoming `x-runner-token` header before forwarding.
 */
export const RUNNER_TOKEN_HEADER = "x-runner-token";

function secretsEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isRunnerTokenConfigured(
  token: string | undefined = process.env.PI_WEB_RUNNER_TOKEN,
): token is string {
  return typeof token === "string" && token.length > 0;
}

export function isValidRunnerToken(
  supplied: string | null,
  token: string | undefined = process.env.PI_WEB_RUNNER_TOKEN,
): boolean {
  if (!isRunnerTokenConfigured(token) || !supplied) return false;
  return secretsEqual(supplied, token);
}
