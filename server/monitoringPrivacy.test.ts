import { describe, expect, it } from "vitest";
import { sanitizeLogAttributes, sanitizeMonitoringEvent } from "../shared/monitoringPrivacy";

describe("monitoring privacy filters", () => {
  it("removes request identity and arbitrary diagnostic payloads from events", () => {
    const event = sanitizeMonitoringEvent({
      message: "Failed for analyst@example.com with Bearer abc.def.ghi",
      user: { id: "user_123", email: "analyst@example.com" },
      request: { headers: { authorization: "Bearer abc.def.ghi" } },
      extra: { transactionReference: "PAYMENT-10001" },
      breadcrumbs: [{ message: "sensitive interaction" }],
      tags: { area: "public_api" },
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.message).toBe("Failed for [redacted-email] with Bearer [redacted]");
    expect(event.tags).toEqual({ area: "public_api" });
  });

  it("redacts sensitive log fields and query values recursively", () => {
    const attributes = sanitizeLogAttributes({
      authorization: "Bearer top-secret",
      nested: {
        apiKey: "private-key",
        destination: "https://example.test/path?customer=123&token=abc",
      },
    });

    expect(attributes).toEqual({
      authorization: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        destination: "https://example.test/path?customer=[redacted]&token=[redacted]",
      },
    });
  });
});
