import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_API_RATE_LIMIT_MAX = 300;
const DEFAULT_BODY_LIMIT_BYTES = 1_000_000;

export type SecurityConfig = {
  trustProxyHops: number;
  apiRateLimitWindowMs: number;
  apiRateLimitMax: number;
  bodyLimitBytes: number;
};

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

/**
 * Reads only bounded numeric controls so a malformed deployment variable cannot
 * silently disable an application-wide protection.
 */
export function getSecurityConfig(
  environment: NodeJS.ProcessEnv = process.env
): SecurityConfig {
  const isProduction = environment.NODE_ENV === "production";
  return {
    trustProxyHops: boundedPositiveInteger(
      environment.TRUST_PROXY_HOPS,
      isProduction ? 1 : 0,
      0,
      3
    ),
    apiRateLimitWindowMs:
      boundedPositiveInteger(
        environment.API_RATE_LIMIT_WINDOW_MINUTES,
        DEFAULT_API_RATE_LIMIT_WINDOW_MS / 60_000,
        1,
        60
      ) * 60_000,
    apiRateLimitMax: boundedPositiveInteger(
      environment.API_RATE_LIMIT_MAX,
      DEFAULT_API_RATE_LIMIT_MAX,
      10,
      10_000
    ),
    bodyLimitBytes: boundedPositiveInteger(
      environment.REQUEST_BODY_LIMIT_BYTES,
      DEFAULT_BODY_LIMIT_BYTES,
      100_000,
      10_000_000
    ),
  };
}

export function apiRateLimitMessage() {
  return {
    error: {
      code: "rate_limited",
      message: "Too many requests. Please retry after a short delay.",
    },
  };
}

/**
 * Applies baseline transport and API protections. The in-memory limiter is
 * intentionally scoped to one application instance; switch to a shared store
 * before scaling the service horizontally.
 */
export function installSecurityMiddleware(app: Express): SecurityConfig {
  const config = getSecurityConfig();

  app.set("trust proxy", config.trustProxyHops);
  app.set("query parser", "simple");
  app.disable("x-powered-by");

  app.use(
    helmet({
      // Clerk and other third-party authentication flows require a verified,
      // deployment-specific CSP allowlist. Keep Helmet's remaining protective
      // headers enabled without breaking the sign-in flow.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: config.apiRateLimitWindowMs,
      limit: config.apiRateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: apiRateLimitMessage(),
    }) as RequestHandler
  );

  return config;
}

/** Sends a stable JSON response for oversized payloads without exposing internal details. */
export const requestParsingErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next
) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    response.status(413).json({
      error: {
        code: "payload_too_large",
        message: "Request bodies must be smaller than 1 MB.",
      },
    });
    return;
  }

  next(error);
};
