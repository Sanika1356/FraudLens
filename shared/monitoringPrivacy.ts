const SENSITIVE_KEY_PATTERN = /authorization|api[_-]?key|cookie|credential|password|secret|session|token/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const QUERY_VALUE_PATTERN = /([?&][^=\s]+)=([^&\s]+)/g;

type MonitoringRecord = Record<string, unknown>;

function redactText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(QUERY_VALUE_PATTERN, "$1=[redacted]");
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as MonitoringRecord).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

/**
 * Sentry events are JSON-shaped records. This is a defence-in-depth filter in
 * addition to disabled automatic collection, ensuring request identity, bodies,
 * cookies, credentials, and arbitrary diagnostic payloads are never retained.
 */
export function sanitizeMonitoringEvent<T extends object>(event: T): T {
  const sanitized = redactValue(event) as T & {
    user?: unknown;
    request?: unknown;
    extra?: unknown;
    breadcrumbs?: unknown;
  };

  delete sanitized.user;
  delete sanitized.request;
  delete sanitized.extra;
  delete sanitized.breadcrumbs;

  return sanitized;
}

export const privacySafeDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [] as never[],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
} as const;

export function sanitizeLogAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  return redactValue(attributes) as Record<string, unknown>;
}
