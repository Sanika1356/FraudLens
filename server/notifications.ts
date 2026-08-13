import { getNotificationPreferences } from "./db";
import { ENV } from "./_core/env";

export const ALERT_CHANNELS = ["email", "slack", "teams"] as const;
export type AlertChannel = typeof ALERT_CHANNELS[number];

export type AlertTransaction = {
  reference: string;
  merchantName: string;
  amount: number;
  transactionCountry: string;
  accountCountry: string;
  riskLevel: "low" | "medium" | "high";
  probability: number;
};

export type AlertDeliveryResult = {
  channel: AlertChannel;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Slack creates webhook URLs on one of these official incoming-webhook domains. */
export function isAllowedSlackWebhookUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  return Boolean(url && (url.hostname === "hooks.slack.com" || url.hostname === "hooks.slack-gov.com"));
}

/** Teams Workflows use Power Automate/Azure hosts; the legacy connector hosts remain accepted for existing workspaces. */
export function isAllowedTeamsWebhookUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname;
  return host.endsWith(".logic.azure.com")
    || host.endsWith(".environment.api.powerplatform.com")
    || host.endsWith(".api.powerplatform.com")
    || host === "outlook.office.com"
    || host === "outlook.office365.com";
}

export function shouldSendHighRiskAlert(score: number, threshold: number): boolean {
  return Number.isFinite(score) && Number.isFinite(threshold) && score >= threshold;
}

function buildAlertText(transaction: AlertTransaction, score: number, isTest: boolean) {
  const heading = isTest ? "FraudLens test high-risk alert" : "FraudLens high-risk transaction alert";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(transaction.amount);
  return [
    heading,
    `Reference: ${transaction.reference}`,
    `Risk score: ${score}/100 (${transaction.riskLevel})`,
    `Merchant: ${transaction.merchantName}`,
    `Amount: ${amount}`,
    `Countries: ${transaction.transactionCountry} transaction / ${transaction.accountCountry} account`,
    isTest ? "This is a test alert from the active workspace." : "Review the case in FraudLens as soon as possible.",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] ?? character));
}

function buildAlertHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;white-space:pre-line;line-height:1.5">${escapeHtml(text)}</div>`;
}

async function sendResendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!ENV.resendApiKey) throw new Error("Resend is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from: ENV.resendFromEmail,
      to: [to],
      subject,
      text,
      html: buildAlertHtml(text),
    }),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
}

async function postWebhook(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
}

async function deliver(channel: AlertChannel, action: () => Promise<void>): Promise<AlertDeliveryResult> {
  try {
    await action();
    return { channel, status: "sent" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown delivery error";
    console.error(`[FraudLens] ${channel} alert delivery failed: ${reason}`);
    return { channel, status: "failed", reason };
  }
}

export async function sendAlertNotifications(
  orgId: string,
  transaction: AlertTransaction,
  score = transaction.probability,
  options: { force?: boolean; channels?: AlertChannel[] } = {},
): Promise<AlertDeliveryResult[]> {
  const preferences = await getNotificationPreferences(orgId);
  if (!options.force && !shouldSendHighRiskAlert(score, preferences.riskThreshold)) return [];

  const channels = new Set(options.channels ?? ALERT_CHANNELS);
  const text = buildAlertText(transaction, score, Boolean(options.force));
  const subject = options.force ? "FraudLens test high-risk alert" : `FraudLens alert: ${transaction.reference} scored ${score}/100`;
  const deliveries: Promise<AlertDeliveryResult>[] = [];

  if (channels.has("email")) {
    if (!preferences.emailEnabled) deliveries.push(Promise.resolve({ channel: "email", status: "skipped", reason: "Email alerts are disabled" }));
    else if (!preferences.toEmail) deliveries.push(Promise.resolve({ channel: "email", status: "skipped", reason: "No email recipient is configured" }));
    else if (!ENV.resendApiKey) deliveries.push(Promise.resolve({ channel: "email", status: "skipped", reason: "Resend is not configured on the server" }));
    else deliveries.push(deliver("email", () => sendResendEmail(preferences.toEmail!, subject, text)));
  }

  if (channels.has("slack")) {
    if (!preferences.slackEnabled) deliveries.push(Promise.resolve({ channel: "slack", status: "skipped", reason: "Slack alerts are disabled" }));
    else if (!preferences.slackWebhookUrl) deliveries.push(Promise.resolve({ channel: "slack", status: "skipped", reason: "No Slack webhook URL is configured" }));
    else if (!isAllowedSlackWebhookUrl(preferences.slackWebhookUrl)) deliveries.push(Promise.resolve({ channel: "slack", status: "skipped", reason: "The stored Slack webhook URL is not an allowed incoming webhook URL" }));
    else deliveries.push(deliver("slack", () => postWebhook(preferences.slackWebhookUrl!, { text })));
  }

  if (channels.has("teams")) {
    if (!preferences.teamsEnabled) deliveries.push(Promise.resolve({ channel: "teams", status: "skipped", reason: "Teams alerts are disabled" }));
    else if (!preferences.teamsWebhookUrl) deliveries.push(Promise.resolve({ channel: "teams", status: "skipped", reason: "No Teams workflow URL is configured" }));
    else if (!isAllowedTeamsWebhookUrl(preferences.teamsWebhookUrl)) deliveries.push(Promise.resolve({ channel: "teams", status: "skipped", reason: "The stored Teams webhook URL is not an allowed workflow URL" }));
    else deliveries.push(deliver("teams", () => postWebhook(preferences.teamsWebhookUrl!, { text })));
  }

  return Promise.all(deliveries);
}

export function createTestAlertTransaction(): AlertTransaction {
  return {
    reference: "TEST-ALERT",
    merchantName: "FraudLens test merchant",
    amount: 1234.56,
    transactionCountry: "US",
    accountCountry: "US",
    riskLevel: "high",
    probability: 100,
  };
}
