import "dotenv/config";
import type { RiskRecord } from "./demoData";
import type { Transaction } from "../drizzle/schema";
import {
  getEnabledWeeklySummaryPreferences,
  getOutcomeFeedbackByOrganization,
  getTransactionsByOrganization,
  hasWeeklySummaryDelivery,
  recordWeeklySummaryDelivery,
} from "./db";
import { ENV } from "./_core/env";
import { reportToText, buildOperationalReport } from "./reports";
import { scoreTransaction } from "./riskEngine";

export type WeeklySummaryWindow = {
  periodStart: Date;
  periodEnd: Date;
};

export type WeeklySummaryDeliveryResult = {
  orgId: string;
  recipient: string | null;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map(part => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseStoredFactors(
  value: string,
  fallback: ReturnType<typeof scoreTransaction>["factors"]
) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? (parsed as ReturnType<typeof scoreTransaction>["factors"])
      : fallback;
  } catch {
    return fallback;
  }
}

/** Converts persisted transactions into the same report shape used by the dashboard. */
export function transactionToRiskRecord(transaction: Transaction): RiskRecord {
  const input = {
    amount: transaction.amountCents / 100,
    merchantCategory: transaction.merchantCategory,
    transactionCountry: transaction.transactionCountry,
    accountCountry: transaction.accountCountry,
    deviceStatus: transaction.deviceStatus,
    transactionHour: transaction.transactionHour,
    recentTransactionCount: transaction.recentTransactionCount,
  };
  const fallback = scoreTransaction(input);
  return {
    id: transaction.id,
    reference: transaction.reference,
    merchantName: titleCase(transaction.merchantCategory),
    createdAt: transaction.createdAt,
    caseStatus: transaction.caseStatus,
    caseNote: transaction.caseNote,
    resolutionReasonCode: transaction.resolutionReasonCode,
    assigneeId: transaction.assigneeId,
    assigneeName: transaction.assigneeName,
    casePriority: transaction.casePriority,
    dueAt: transaction.dueAt,
    isNew: transaction.isNew,
    llmSummary: transaction.llmSummary,
    llmNextStep: transaction.llmNextStep,
    ...input,
    riskLevel: transaction.riskLabel,
    probability: transaction.riskProbability,
    factors: parseStoredFactors(transaction.factorJson, fallback.factors),
    deterministicExplanation: transaction.deterministicExplanation,
  };
}

/** Returns the complete previous calendar week in UTC: Monday 00:00 through Sunday 23:59:59.999. */
export function previousWeekWindow(now = new Date()): WeeklySummaryWindow {
  const nextMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  nextMonday.setUTCDate(nextMonday.getUTCDate() - daysSinceMonday);
  const periodStart = new Date(nextMonday);
  periodStart.setUTCDate(periodStart.getUTCDate() - 7);
  const periodEnd = new Date(nextMonday.getTime() - 1);
  return { periodStart, periodEnd };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character
  );
}

function weeklySubject(window: WeeklySummaryWindow) {
  return `FraudLens weekly risk summary: ${window.periodStart.toISOString().slice(0, 10)} to ${window.periodEnd.toISOString().slice(0, 10)}`;
}

async function sendResendWeeklySummary(
  to: string,
  subject: string,
  text: string
): Promise<string | null> {
  if (!ENV.resendApiKey) throw new Error("RESEND_API_KEY is not configured");
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
      html: `<div style="font-family:Arial,sans-serif;white-space:pre-line;line-height:1.5">${escapeHtml(text)}</div>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;
  return payload?.id ?? null;
}

/**
 * Sends each enabled organization one previous-week report at most once. The database
 * delivery record makes reruns and GitHub Actions retries idempotent after successful delivery.
 */
export async function deliverWeeklySummaries(
  now = new Date()
): Promise<WeeklySummaryDeliveryResult[]> {
  const window = previousWeekWindow(now);
  const preferences = await getEnabledWeeklySummaryPreferences();
  const results: WeeklySummaryDeliveryResult[] = [];

  for (const preferencesForOrg of preferences) {
    const recipient = preferencesForOrg.toEmail;
    if (!recipient) {
      results.push({
        orgId: preferencesForOrg.orgId,
        recipient: null,
        status: "skipped",
        reason: "No recipient is configured",
      });
      continue;
    }

    try {
      if (
        await hasWeeklySummaryDelivery(
          preferencesForOrg.orgId,
          window.periodStart
        )
      ) {
        results.push({
          orgId: preferencesForOrg.orgId,
          recipient,
          status: "skipped",
          reason: "This reporting period was already delivered",
        });
        continue;
      }

      const [transactions, feedback] = await Promise.all([
        getTransactionsByOrganization(preferencesForOrg.orgId),
        getOutcomeFeedbackByOrganization(preferencesForOrg.orgId),
      ]);
      const report = buildOperationalReport(
        transactions.map(transactionToRiskRecord),
        feedback,
        { dateFrom: window.periodStart, dateTo: window.periodEnd },
        now
      );
      const text = reportToText(report);
      const resendEmailId = await sendResendWeeklySummary(
        recipient,
        weeklySubject(window),
        text
      );
      await recordWeeklySummaryDelivery({
        orgId: preferencesForOrg.orgId,
        periodStart: window.periodStart,
        recipient,
        resendEmailId,
      });
      results.push({
        orgId: preferencesForOrg.orgId,
        recipient,
        status: "sent",
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown delivery error";
      console.error(
        `[FraudLens] Weekly summary delivery failed for ${preferencesForOrg.orgId}: ${reason}`
      );
      results.push({
        orgId: preferencesForOrg.orgId,
        recipient,
        status: "failed",
        reason,
      });
    }
  }

  return results;
}

export async function runWeeklySummaryDelivery() {
  const results = await deliverWeeklySummaries();
  for (const result of results) {
    console.log(
      `[FraudLens] Weekly summary ${result.status} for ${result.orgId}${result.reason ? `: ${result.reason}` : ""}`
    );
  }
  if (results.some(result => result.status === "failed")) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runWeeklySummaryDelivery();
}
