import { randomUUID } from "crypto";
import { ENV } from "./_core/env";

export const EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
] as const;

export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];

type StorageData = Buffer | Uint8Array | string;

type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

function getSupabaseConfig(): SupabaseStorageConfig {
  const url = ENV.supabaseUrl.replace(/\/+$/, "");
  const serviceRoleKey = ENV.supabaseServiceRoleKey;
  const bucket = ENV.supabaseStorageBucket.trim();

  if (!url || !serviceRoleKey || !bucket) {
    throw new Error(
      "Evidence storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET."
    );
  }

  return { url, serviceRoleKey, bucket };
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    ENV.supabaseUrl.trim() &&
      ENV.supabaseServiceRoleKey.trim() &&
      ENV.supabaseStorageBucket.trim()
  );
}

/**
 * Performs a metadata-only Storage request for the configured evidence bucket.
 * This is suitable for scheduled health checks and never reads or writes evidence objects.
 */
export async function storageCheckBucket(): Promise<void> {
  const config = getSupabaseConfig();
  const response = await fetch(
    `${config.url}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`,
    { method: "GET", headers: headers(config) }
  );

  if (!response.ok) {
    // Do not emit the response body: provider error payloads can include operational detail.
    throw new Error(
      `Supabase Storage health check failed with status ${response.status}.`
    );
  }
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    !key ||
    key
      .split("/")
      .some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Storage key is invalid.");
  }
  return key;
}

function encodeObjectPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 12);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot <= relKey.lastIndexOf("/")) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function headers(
  config: SupabaseStorageConfig,
  contentType?: string
): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function storageError(
  response: Response,
  operation: string
): Promise<Error> {
  const detail = await response.text().catch(() => "");
  return new Error(
    `Supabase Storage ${operation} failed (${response.status})${detail ? `: ${detail}` : ""}`
  );
}

export function createEvidenceStorageKey(
  orgId: string,
  transactionId: number,
  fileName: string
): string {
  const safeName =
    fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "evidence";
  return `evidence/${encodeURIComponent(orgId)}/${transactionId}/${safeName}`;
}

export async function storagePut(
  relKey: string,
  data: StorageData,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getSupabaseConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const uploadUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(key)}`;
  const body =
    typeof data === "string"
      ? data
      : new Blob([Uint8Array.from(data).buffer], { type: contentType });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { ...headers(config, contentType), "x-upsert": "false" },
    body,
  });

  if (!response.ok) throw await storageError(response, "upload");
  return { key, url: `/storage/${encodeObjectPath(key)}` };
}

export async function storageGetSignedUrl(
  relKey: string,
  expiresInSeconds = 60
): Promise<string> {
  const config = getSupabaseConfig();
  const key = normalizeKey(relKey);
  const expiry = Math.min(Math.max(Math.floor(expiresInSeconds), 10), 300);
  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeObjectPath(key)}`,
    {
      method: "POST",
      headers: headers(config, "application/json"),
      body: JSON.stringify({ expiresIn: expiry }),
    }
  );

  if (!response.ok) throw await storageError(response, "signed URL creation");
  const result = (await response.json()) as {
    signedURL?: string;
    signedUrl?: string;
  };
  const signedUrl = result.signedURL ?? result.signedUrl;
  if (!signedUrl)
    throw new Error("Supabase Storage returned an empty signed URL.");
  return signedUrl.startsWith("http") ? signedUrl : `${config.url}${signedUrl}`;
}

export async function storageDelete(relKey: string): Promise<void> {
  const config = getSupabaseConfig();
  const key = normalizeKey(relKey);
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}`,
    {
      method: "DELETE",
      headers: headers(config, "application/json"),
      body: JSON.stringify({ prefixes: [key] }),
    }
  );
  if (!response.ok) throw await storageError(response, "deletion");
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${encodeObjectPath(key)}` };
}
