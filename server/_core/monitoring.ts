import * as Sentry from "@sentry/node";
import type { Express } from "express";
import {
  privacySafeDataCollection,
  sanitizeLogAttributes,
  sanitizeMonitoringEvent,
} from "../../shared/monitoringPrivacy";

function parseSampleRate(rawValue: string | undefined): number {
  const fallback = process.env.NODE_ENV === "production" ? 0.1 : 0;
  const parsed = Number(rawValue ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : fallback;
}

const sentryDsn = process.env.SENTRY_DSN ?? "";
export const isServerMonitoringEnabled = Boolean(sentryDsn);

if (isServerMonitoringEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    enableLogs: true,
    maxBreadcrumbs: 0,
    dataCollection: privacySafeDataCollection,
    beforeSend: sanitizeMonitoringEvent,
    beforeSendTransaction: sanitizeMonitoringEvent,
  });
}

/** Records only scrubbed application metadata; user, request, and payload data are never attached. */
export function captureServerException(
  error: unknown,
  context: { area: string; operation?: string; requestId?: string } = {
    area: "server",
  }
): void {
  if (!isServerMonitoringEnabled) return;

  Sentry.withScope(scope => {
    scope.setTag("area", context.area);
    if (context.operation) scope.setTag("operation", context.operation);
    if (context.requestId) scope.setTag("request_id", context.requestId);
    Sentry.captureException(error);
  });
}

export function logServerError(
  message: string,
  attributes: Record<string, unknown> = {}
): void {
  if (!isServerMonitoringEnabled) return;
  Sentry.logger.error(message, sanitizeLogAttributes(attributes));
}

export function installMonitoringErrorHandler(app: Express): void {
  if (!isServerMonitoringEnabled) return;
  Sentry.setupExpressErrorHandler(app);
}
