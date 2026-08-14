import { afterEach, describe, expect, it, vi } from "vitest";
import { upsertNotificationPreferences } from "./db";
import {
  createTestAlertTransaction,
  sendAlertNotifications,
} from "./notifications";

describe("high-risk notification delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delivers enabled Slack and Teams alerts after a score reaches the organization threshold", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const orgId = "org_notification_delivery";
    await upsertNotificationPreferences(orgId, {
      emailEnabled: false,
      toEmail: null,
      slackEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/services/T123/B123/secret",
      teamsEnabled: true,
      teamsWebhookUrl:
        "https://prod-01.westus.logic.azure.com/workflows/test/triggers/manual/paths/invoke",
      riskThreshold: 80,
    });

    const results = await sendAlertNotifications(
      orgId,
      createTestAlertTransaction(),
      80
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", status: "skipped" }),
        expect.objectContaining({ channel: "slack", status: "sent" }),
        expect.objectContaining({ channel: "teams", status: "sent" }),
      ])
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        "https://hooks.slack.com/services/T123/B123/secret",
        "https://prod-01.westus.logic.azure.com/workflows/test/triggers/manual/paths/invoke",
      ])
    );
  });

  it("does not invoke any notification transport below the organization threshold", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const orgId = "org_notification_below_threshold";
    await upsertNotificationPreferences(orgId, {
      emailEnabled: false,
      toEmail: null,
      slackEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/services/T123/B123/secret",
      teamsEnabled: false,
      teamsWebhookUrl: null,
      riskThreshold: 85,
    });

    const results = await sendAlertNotifications(
      orgId,
      createTestAlertTransaction(),
      84
    );

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
