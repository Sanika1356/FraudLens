import { describe, expect, it } from "vitest";
import { validateProductionEnvironment } from "./env";
import { apiRateLimitMessage, getSecurityConfig } from "./security";

describe("production security configuration", () => {
  it("uses conservative defaults when optional values are missing or malformed", () => {
    const config = getSecurityConfig({
      NODE_ENV: "production",
      API_RATE_LIMIT_WINDOW_MINUTES: "not-a-number",
      API_RATE_LIMIT_MAX: "0",
      REQUEST_BODY_LIMIT_BYTES: "999999999",
      TRUST_PROXY_HOPS: "99",
    });

    expect(config).toEqual({
      trustProxyHops: 1,
      apiRateLimitWindowMs: 15 * 60 * 1000,
      apiRateLimitMax: 300,
      bodyLimitBytes: 1_000_000,
    });
  });

  it("accepts bounded rate-limit and body-size overrides", () => {
    const config = getSecurityConfig({
      NODE_ENV: "production",
      TRUST_PROXY_HOPS: "2",
      API_RATE_LIMIT_WINDOW_MINUTES: "5",
      API_RATE_LIMIT_MAX: "500",
      REQUEST_BODY_LIMIT_BYTES: "2000000",
    });

    expect(config).toEqual({
      trustProxyHops: 2,
      apiRateLimitWindowMs: 5 * 60 * 1000,
      apiRateLimitMax: 500,
      bodyLimitBytes: 2_000_000,
    });
  });

  it("returns a stable, non-diagnostic rate-limit response", () => {
    expect(apiRateLimitMessage()).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many requests. Please retry after a short delay.",
      },
    });
  });
});

describe("production environment validation", () => {
  it("does not enforce deployment-only requirements outside production", () => {
    expect(() =>
      validateProductionEnvironment({ NODE_ENV: "test" })
    ).not.toThrow();
  });

  it("rejects an incomplete production configuration without including secret values", () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://not-disclosed",
      })
    ).toThrow(
      "Production configuration is missing required variables: CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY, OWNER_OPEN_ID"
    );
  });

  it("accepts the required production configuration", () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://configured",
        CLERK_SECRET_KEY: "configured",
        VITE_CLERK_PUBLISHABLE_KEY: "configured",
        OWNER_OPEN_ID: "configured",
      })
    ).not.toThrow();
  });
});
