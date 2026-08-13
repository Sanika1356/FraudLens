import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { ApiKeyScope } from "./db";

export const PUBLIC_API_KEY_SCOPE = "transactions:write" as const satisfies ApiKeyScope;
export const PUBLIC_API_RATE_LIMIT_PER_MINUTE = 60;

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function createApiKeySecret(): { secret: string; keyPrefix: string; keyHash: string } {
  const secret = `fl_live_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    keyPrefix: `${secret.slice(0, 16)}…`,
    keyHash: hashApiKey(secret),
  };
}

export function parseApiKeyScopes(scopesJson: string): ApiKeyScope[] {
  try {
    const parsed: unknown = JSON.parse(scopesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is ApiKeyScope => scope === PUBLIC_API_KEY_SCOPE);
  } catch {
    return [];
  }
}

/** Returns only syntactically plausible keys; malformed credentials are never forwarded to lookup code. */
export function extractBearerApiKey(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(fl_live_[A-Za-z0-9_-]{32,128})$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** Performs a constant-time comparison for test and defensive-use cases. */
export function apiKeysMatch(candidate: string, expected: string): boolean {
  const candidateHash = Buffer.from(hashApiKey(candidate), "hex");
  const expectedHash = Buffer.from(hashApiKey(expected), "hex");
  return candidateHash.length === expectedHash.length && timingSafeEqual(candidateHash, expectedHash);
}

export function isApiKeyActive(revokedAt: Date | null, expiresAt: Date | null, now = new Date()): boolean {
  return !revokedAt && (!expiresAt || expiresAt > now);
}

export function apiKeyDisclosureWarning(): string {
  return "Copy this API key now. It will not be shown again.";
}
