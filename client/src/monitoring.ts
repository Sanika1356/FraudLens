import * as Sentry from "@sentry/react";
import {
  privacySafeDataCollection,
  sanitizeLogAttributes,
  sanitizeMonitoringEvent,
} from "@shared/monitoringPrivacy";

function parseSampleRate(rawValue: string | undefined): number {
  const fallback = import.meta.env.PROD ? 0.1 : 0;
  const parsed = Number(rawValue ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : fallback;
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN ?? "";
export const isClientMonitoringEnabled = Boolean(sentryDsn);

if (isClientMonitoringEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    enableLogs: true,
    maxBreadcrumbs: 0,
    dataCollection: privacySafeDataCollection,
    beforeSend: sanitizeMonitoringEvent,
    beforeSendTransaction: sanitizeMonitoringEvent,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

/** Captures only a scrubbed exception with fixed diagnostic tags, never customer or transaction data. */
export function captureClientException(error: unknown, area: string): void {
  if (!isClientMonitoringEnabled) return;

  Sentry.withScope(scope => {
    scope.setTag("area", area);
    Sentry.captureException(error);
  });
}

export function logClientError(message: string, attributes: Record<string, unknown> = {}): void {
  if (!isClientMonitoringEnabled) return;
  Sentry.logger.error(message, sanitizeLogAttributes(attributes));
}
