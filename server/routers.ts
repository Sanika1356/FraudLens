import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { organizationAdministratorProcedure, organizationManagerProcedure, organizationProcedure, publicProcedure, router } from "./_core/trpc";
import {
  FRAUDLENS_ROLES,
  ORGANIZATION_MEMBERSHIP_ROLES,
  changeFraudLensRole,
  changeOrganizationMembershipRole,
  deactivateOrganizationMember,
  getWorkspaceDirectory,
  inviteOrganizationMember,
  revokeMemberSessions,
  revokeOrganizationInvitation,
} from "./adminManagement";
import { addCaseComment, addCaseEvidence, createApiKey, deleteOutcomeFeedback, getApiKeysByOrganization, getApiRequestLogsByOrganization, getAuditEventsByOrganization, getCaseCollaboration, getDb, getNotificationPreferences, getOutcomeFeedbackByOrganization, getTransactionReferencesByOrganization, getWeeklySummaryPreferences, persistTransaction, recordAuditEvent, replaceCaseTags, revokeApiKey, upsertNotificationPreferences, upsertOutcomeFeedback, upsertWeeklySummaryPreferences } from "./db";
import { createEvidenceStorageKey, isSupabaseStorageConfigured, storageDelete, storagePut } from "./storage";
import { decodeAndValidateEvidenceAttachment } from "./evidenceFiles";
import { demoTransactions, driftDemo, RiskRecord } from "./demoData";
import { createInvestigatorSummary } from "./investigatorSummary";
import { buildModelQualityReport, classifyOutcome } from "./outcomeFeedback";
import { CASE_STATUSES, RISK_LEVELS, RiskInput, scoreTransaction } from "./riskEngine";
import { parseCsvImport } from "./csvImport";
import { ALERT_CHANNELS, createTestAlertTransaction, isAllowedSlackWebhookUrl, isAllowedTeamsWebhookUrl, sendAlertNotifications } from "./notifications";
import { buildOperationalReport, reportFileName, reportToCsv, reportToText } from "./reports";
import { apiKeyDisclosureWarning, createApiKeySecret, parseApiKeyScopes, PUBLIC_API_KEY_SCOPE } from "./apiKeys";

export const riskInputSchema = z.object({
  amount: z.number().positive().max(1000000),
  merchantCategory: z.string().trim().min(2).max(80),
  transactionCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  accountCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  deviceStatus: z.enum(["known", "new"]),
  transactionHour: z.number().int().min(0).max(23),
  recentTransactionCount: z.number().int().min(0).max(50),
});

export const RESOLUTION_REASON_CODES = [
  "customer_dispute",
  "pattern_match",
  "account_takeover",
  "merchant_confirmation",
  "customer_verified",
  "duplicate_alert",
  "low_risk_pattern",
  "other",
] as const;

export const caseUpdateSchema = z.object({
  id: z.number().int().positive(),
  caseStatus: z.enum(CASE_STATUSES),
  note: z.string().trim().min(3).max(1000),
  resolutionReasonCode: z.enum(RESOLUTION_REASON_CODES).nullable().optional(),
});

export const CASE_PRIORITIES = ["critical", "high", "standard"] as const;
export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  toEmail: z.string().trim().email().max(320).nullable(),
  slackEnabled: z.boolean(),
  slackWebhookUrl: z.string().trim().url().max(2048).refine(isAllowedSlackWebhookUrl, "Use a valid Slack incoming webhook URL.").nullable(),
  teamsEnabled: z.boolean(),
  teamsWebhookUrl: z.string().trim().url().max(2048).refine(isAllowedTeamsWebhookUrl, "Use a valid Teams or Power Automate workflow URL.").nullable(),
  riskThreshold: z.number().int().min(0).max(100),
}).superRefine((preferences, context) => {
  if (preferences.emailEnabled && !preferences.toEmail) context.addIssue({ code: z.ZodIssueCode.custom, path: ["toEmail"], message: "Provide an email recipient before enabling email alerts." });
  if (preferences.slackEnabled && !preferences.slackWebhookUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["slackWebhookUrl"], message: "Provide a Slack webhook URL before enabling Slack alerts." });
  if (preferences.teamsEnabled && !preferences.teamsWebhookUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["teamsWebhookUrl"], message: "Provide a Teams workflow URL before enabling Teams alerts." });
});
export const weeklySummaryPreferencesSchema = z.object({
  enabled: z.boolean(),
  toEmail: z.string().trim().email().max(320).nullable(),
}).superRefine((preferences, context) => {
  if (preferences.enabled && !preferences.toEmail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["toEmail"], message: "Provide an email recipient before enabling weekly summaries." });
  }
});

export const caseWorkflowUpdateSchema = z.object({
  id: z.number().int().positive(),
  assigneeId: z.string().trim().min(1).max(64).nullable(),
  casePriority: z.enum(CASE_PRIORITIES),
  dueAt: z.date().nullable(),
});

export const reportFiltersSchema = z.object({
  riskLevel: z.enum(RISK_LEVELS).optional(),
  caseStatus: z.enum(CASE_STATUSES).optional(),
  assigneeId: z.string().trim().min(1).max(64).optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
}).superRefine((filters, context) => {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "The report end date must be on or after the start date." });
  }
});

const recordsByOrganization = new Map<string, RiskRecord[]>();
let nextId = Math.max(...demoTransactions.map((record) => record.id)) + 1;

function cloneDemoTransaction(record: RiskRecord): RiskRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    factors: [...record.factors],
    dueAt: record.dueAt ? new Date(record.dueAt) : null,
  };
}

/**
 * Demo records are seeded separately for every active organization. In production,
 * database reads must always be filtered by the same Clerk organization identifier.
 */
function getRecords(orgId: string) {
  let records = recordsByOrganization.get(orgId);
  if (!records) {
    records = demoTransactions.map(cloneDemoTransaction);
    recordsByOrganization.set(orgId, records);
  }
  return records;
}

function getRecord(orgId: string, id: number) {
  return getRecords(orgId).find((record) => record.id === id);
}

export function applyCaseUpdate(record: RiskRecord, input: z.infer<typeof caseUpdateSchema>) {
  record.caseStatus = input.caseStatus;
  record.caseNote = input.note.trim();
  record.resolutionReasonCode = input.caseStatus === "under_review" ? null : input.resolutionReasonCode ?? null;
  record.isNew = false;
  return record;
}

function actualOutcomeForCaseStatus(caseStatus: RiskRecord["caseStatus"]) {
  if (caseStatus === "confirmed_fraud") return "fraud" as const;
  if (caseStatus === "legitimate") return "legitimate" as const;
  return null;
}

export function applyCaseWorkflowUpdate(
  record: RiskRecord,
  input: z.infer<typeof caseWorkflowUpdateSchema>,
  assigneeName: string | null,
) {
  record.assigneeId = input.assigneeId;
  record.assigneeName = assigneeName;
  record.casePriority = input.casePriority;
  record.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  return record;
}

function createReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FRD-${suffix}`;
}

function merchantName(category: string) {
  return category.trim().split(/\s+/).map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

function createRiskRecord(input: RiskInput, reference = createReference()): RiskRecord {
  const decision = scoreTransaction(input);
  return {
    id: nextId++,
    reference,
    merchantName: merchantName(input.merchantCategory),
    createdAt: new Date(),
    caseStatus: "under_review",
    caseNote: null,
    resolutionReasonCode: null,
    assigneeId: null,
    assigneeName: null,
    casePriority: decision.riskLevel === "high" ? "critical" : decision.riskLevel === "medium" ? "high" : "standard",
    dueAt: decision.riskLevel === "high" ? new Date(Date.now() + 4 * 60 * 60 * 1000) : decision.riskLevel === "medium" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
    isNew: decision.riskLevel === "high",
    llmSummary: null,
    llmNextStep: null,
    ...input,
    ...decision,
  };
}

function asInsertTransaction(record: RiskRecord) {
  return {
    reference: record.reference,
    amountCents: Math.round(record.amount * 100),
    merchantCategory: record.merchantCategory,
    transactionCountry: record.transactionCountry,
    accountCountry: record.accountCountry,
    deviceStatus: record.deviceStatus,
    transactionHour: record.transactionHour,
    recentTransactionCount: record.recentTransactionCount,
    riskLabel: record.riskLevel,
    riskProbability: record.probability,
    factorJson: JSON.stringify(record.factors),
    deterministicExplanation: record.deterministicExplanation,
    llmSummary: record.llmSummary,
    llmNextStep: record.llmNextStep,
    caseStatus: record.caseStatus,
    caseNote: record.caseNote,
    resolutionReasonCode: record.resolutionReasonCode,
    assigneeId: record.assigneeId,
    assigneeName: record.assigneeName,
    casePriority: record.casePriority,
    dueAt: record.dueAt,
    isNew: record.isNew,
  } as const;
}

export type AssessmentSubmissionActor = {
  id: string | null;
  name: string | null;
  source: "dashboard" | "public_api";
  apiKeyId?: number;
};

/**
 * Creates, persists, audits, and evaluates alerts for a scored transaction. The dashboard
 * and public API use this one workflow to prevent behavior from drifting between channels.
 */
export async function submitRiskAssessment(
  orgId: string,
  input: RiskInput,
  actor: AssessmentSubmissionActor,
  reference?: string,
): Promise<RiskRecord> {
  const record = createRiskRecord(input, reference);
  getRecords(orgId).unshift(record);
  await persistTransaction(orgId, asInsertTransaction(record));
  await recordAuditEvent({
    orgId,
    eventType: "case.assessment_created",
    actorId: actor.id,
    actorName: actor.name,
    subjectType: "case",
    subjectId: String(record.id),
    summary: `Created case ${record.reference} from a ${actor.source === "public_api" ? "public API" : "dashboard"} risk assessment.`,
    metadata: {
      riskLevel: record.riskLevel,
      casePriority: record.casePriority,
      source: actor.source,
      apiKeyId: actor.apiKeyId ?? null,
    },
  });
  void sendAlertNotifications(orgId, record).catch((error) => console.error("[FraudLens] Alert evaluation failed", error));
  return record;
}

function summarizeApiKey(key: Awaited<ReturnType<typeof getApiKeysByOrganization>>[number]) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: parseApiKeyScopes(key.scopesJson),
    createdByName: key.createdByName,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
  };
}

function buildOverview(records: RiskRecord[]) {
  const total = records.length;
  const highRisk = records.filter((record) => record.riskLevel === "high");
  const underReview = records.filter((record) => record.caseStatus === "under_review");
  const now = Date.now();
  return {
    total,
    highRisk: highRisk.length,
    underReview: underReview.length,
    newlyFlagged: records.filter((record) => record.isNew && record.riskLevel === "high").length,
    averageProbability: total === 0 ? 0 : Math.round(records.reduce((totalValue, record) => totalValue + record.probability, 0) / total),
    riskDistribution: RISK_LEVELS.map((riskLevel) => ({ riskLevel, count: records.filter((record) => record.riskLevel === riskLevel).length })),
    highRiskAlerts: highRisk.filter((record) => now - record.createdAt.getTime() < 1000 * 60 * 60 * 24).slice(0, 5),
    queue: [...records].sort((first, second) => second.probability - first.probability).slice(0, 6),
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user && ctx.orgId) {
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "authentication.workspace_accessed",
          actorId: ctx.user.openId,
          actorName: ctx.user.name ?? ctx.user.email,
          subjectType: "workspace",
          subjectId: ctx.orgId,
          summary: "Authenticated user accessed the active workspace.",
        });
      }
      return ctx.user;
    }),
  }),
  notifications: router({
    get: organizationManagerProcedure.query(({ ctx }) => getNotificationPreferences(ctx.orgId)),
    update: organizationManagerProcedure.input(notificationPreferencesSchema).mutation(async ({ ctx, input }) => {
      const preferences = await upsertNotificationPreferences(ctx.orgId, input);
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "notifications.preferences_updated",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "notification_preferences",
        subjectId: String(preferences.id),
        summary: "Updated high-risk alert preferences.",
        metadata: {
          emailEnabled: preferences.emailEnabled,
          slackEnabled: preferences.slackEnabled,
          teamsEnabled: preferences.teamsEnabled,
          riskThreshold: preferences.riskThreshold,
        },
      });
      return preferences;
    }),
    testAlert: organizationManagerProcedure.input(z.object({ channel: z.enum(ALERT_CHANNELS).optional() }).optional()).mutation(async ({ ctx, input }) => {
      const channels = input?.channel ? [input.channel] : undefined;
      const results = await sendAlertNotifications(ctx.orgId, createTestAlertTransaction(), 100, { force: true, channels });
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "notifications.test_alert_sent",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "notification_preferences",
        subjectId: ctx.orgId,
        summary: `Sent a test alert${input?.channel ? ` through ${input.channel}` : " through configured channels"}.`,
        metadata: { channels: channels ?? ALERT_CHANNELS, results: results.map((result) => ({ channel: result.channel, status: result.status })) },
      });
      return { results };
    }),
  }),
  weeklySummaries: router({
    get: organizationManagerProcedure.query(({ ctx }) => getWeeklySummaryPreferences(ctx.orgId)),
    update: organizationManagerProcedure.input(weeklySummaryPreferencesSchema).mutation(async ({ ctx, input }) => {
      const preferences = await upsertWeeklySummaryPreferences(ctx.orgId, input);
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "weekly_summary.preferences_updated",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "weekly_summary_preferences",
        subjectId: String(preferences.id),
        summary: `${preferences.enabled ? "Enabled" : "Disabled"} automatic weekly risk summaries.`,
        metadata: { enabled: preferences.enabled, hasRecipient: Boolean(preferences.toEmail) },
      });
      return preferences;
    }),
  }),
  apiKeys: router({
    list: organizationManagerProcedure.query(async ({ ctx }) => {
      const keys = await getApiKeysByOrganization(ctx.orgId);
      return keys.map(summarizeApiKey);
    }),
    create: organizationManagerProcedure.input(z.object({
      name: z.string().trim().min(3).max(80),
      expiresAt: z.date().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (input.expiresAt && input.expiresAt <= new Date()) throw new Error("An API key expiry date must be in the future.");
      const issued = createApiKeySecret();
      const key = await createApiKey({
        orgId: ctx.orgId,
        name: input.name,
        keyPrefix: issued.keyPrefix,
        keyHash: issued.keyHash,
        scopes: [PUBLIC_API_KEY_SCOPE],
        createdById: ctx.user!.openId,
        createdByName: ctx.user!.name ?? ctx.user!.email ?? "Manager",
        expiresAt: input.expiresAt ?? null,
      });
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "api_key.created",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "api_key",
        subjectId: String(key.id),
        summary: `Created API key ${key.name}.`,
        metadata: { scopes: [PUBLIC_API_KEY_SCOPE], expiresAt: key.expiresAt?.toISOString() ?? null },
      });
      return { apiKey: summarizeApiKey(key), secret: issued.secret, disclosureWarning: apiKeyDisclosureWarning() };
    }),
    revoke: organizationManagerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const key = await revokeApiKey(ctx.orgId, input.id);
      if (!key) throw new Error("API key not found in this organization.");
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "api_key.revoked",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "api_key",
        subjectId: String(key.id),
        summary: `Revoked API key ${key.name}.`,
        metadata: { keyPrefix: key.keyPrefix },
      });
      return summarizeApiKey(key);
    }),
    requestLogs: organizationManagerProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(({ ctx, input }) => getApiRequestLogsByOrganization(ctx.orgId, input?.limit ?? 100)),
  }),
  audit: router({
    list: organizationManagerProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
      const events = await getAuditEventsByOrganization(ctx.orgId, input?.limit ?? 100);
      return events.map((event) => {
        let metadata: Record<string, unknown> = {};
        try { metadata = JSON.parse(event.metadataJson) as Record<string, unknown>; } catch { /* preserve the event if legacy metadata is malformed */ }
        return { ...event, metadata };
      });
    }),
  }),
  administration: router({
    directory: organizationAdministratorProcedure.query(({ ctx }) => getWorkspaceDirectory(ctx.orgId!)),
    invite: organizationAdministratorProcedure.input(z.object({
      emailAddress: z.string().trim().email().max(320),
      organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const invitation = await inviteOrganizationMember({
        orgId: ctx.orgId!,
        inviterUserId: ctx.user!.openId,
        emailAddress: input.emailAddress,
        role: input.organizationRole,
      });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.member_invited", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "invitation", subjectId: invitation.id, summary: "Invited a member to the workspace.", metadata: { organizationRole: invitation.role } });
      return { id: invitation.id, email: invitation.emailAddress, role: invitation.role, status: invitation.status };
    }),
    updateOrganizationRole: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
      organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const membership = await changeOrganizationMembershipRole({
        orgId: ctx.orgId!,
        actorUserId: ctx.user!.openId,
        userId: input.userId,
        role: input.organizationRole,
      });
      const userId = membership.publicUserData?.userId ?? input.userId;
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.organization_role_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: userId, summary: "Changed a member's organization role.", metadata: { organizationRole: membership.role } });
      return { userId, organizationRole: membership.role };
    }),
    updateFraudLensRole: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
      applicationRole: z.enum(FRAUDLENS_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const user = await changeFraudLensRole({
        orgId: ctx.orgId!,
        actorUserId: ctx.user!.openId,
        userId: input.userId,
        role: input.applicationRole,
      });
      const applicationRole = user?.role ?? input.applicationRole;
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.application_role_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Changed a member's FraudLens role.", metadata: { applicationRole } });
      return { userId: input.userId, applicationRole };
    }),
    deactivateMember: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await deactivateOrganizationMember({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, userId: input.userId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.member_deactivated", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Deactivated a member's access to this workspace." });
      return { userId: input.userId };
    }),
    revokeSessions: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      const result = await revokeMemberSessions({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, userId: input.userId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.sessions_revoked", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Revoked a member's active sessions.", metadata: { revokedCount: result.revokedCount } });
      return result;
    }),
    revokeInvitation: organizationAdministratorProcedure.input(z.object({
      invitationId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await revokeOrganizationInvitation({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, invitationId: input.invitationId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.invitation_revoked", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "invitation", subjectId: input.invitationId, summary: "Revoked a pending workspace invitation." });
      return { invitationId: input.invitationId };
    }),
  }),
  reports: router({
    overview: organizationManagerProcedure.input(reportFiltersSchema.optional()).query(async ({ ctx, input }) => {
      const feedback = await getOutcomeFeedbackByOrganization(ctx.orgId);
      return buildOperationalReport(getRecords(ctx.orgId), feedback, input ?? {});
    }),
    downloadCsv: organizationManagerProcedure.input(reportFiltersSchema.optional()).mutation(async ({ ctx, input }) => {
      const report = buildOperationalReport(getRecords(ctx.orgId), await getOutcomeFeedbackByOrganization(ctx.orgId), input ?? {});
      const fileName = reportFileName("csv", report.generatedAt);
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "report.csv_exported",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "operational_report",
        subjectId: fileName,
        summary: `Exported a filtered operational CSV report (${report.summary.assessed} transaction${report.summary.assessed === 1 ? "" : "s"}).`,
        metadata: { filters: input ?? {}, assessed: report.summary.assessed },
      });
      return { fileName, content: reportToCsv(report), contentType: "text/csv;charset=utf-8" };
    }),
    downloadSummary: organizationManagerProcedure.input(reportFiltersSchema.optional()).mutation(async ({ ctx, input }) => {
      const report = buildOperationalReport(getRecords(ctx.orgId), await getOutcomeFeedbackByOrganization(ctx.orgId), input ?? {});
      const fileName = reportFileName("txt", report.generatedAt);
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "report.summary_downloaded",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "operational_report",
        subjectId: fileName,
        summary: `Downloaded an operational report summary (${report.summary.assessed} transaction${report.summary.assessed === 1 ? "" : "s"}).`,
        metadata: { filters: input ?? {}, assessed: report.summary.assessed },
      });
      return { fileName, content: reportToText(report), contentType: "text/plain;charset=utf-8" };
    }),
  }),
  risk: router({
    overview: organizationProcedure.query(({ ctx }) => buildOverview(getRecords(ctx.orgId))),
    list: organizationProcedure.input(z.object({
      riskLevel: z.enum(RISK_LEVELS).optional(),
      caseStatus: z.enum(CASE_STATUSES).optional(),
      casePriority: z.enum(CASE_PRIORITIES).optional(),
      assigneeId: z.string().trim().min(1).max(64).optional(),
      unassignedOnly: z.boolean().optional(),
      merchantCategory: z.string().trim().max(80).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional()).query(({ ctx, input }) => {
      const filtered = getRecords(ctx.orgId).filter((record) => {
        if (input?.riskLevel && record.riskLevel !== input.riskLevel) return false;
        if (input?.caseStatus && record.caseStatus !== input.caseStatus) return false;
        if (input?.casePriority && record.casePriority !== input.casePriority) return false;
        if (input?.assigneeId && record.assigneeId !== input.assigneeId) return false;
        if (input?.unassignedOnly && record.assigneeId !== null) return false;
        if (input?.merchantCategory && record.merchantCategory.toLowerCase() !== input.merchantCategory.toLowerCase()) return false;
        if (input?.dateFrom && record.createdAt < input.dateFrom) return false;
        if (input?.dateTo && record.createdAt > input.dateTo) return false;
        return true;
      });
      return [...filtered].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
    }),
    detail: organizationProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getRecord(ctx.orgId, input.id) ?? null),
    assess: organizationProcedure.input(riskInputSchema).mutation(async ({ ctx, input }) => submitRiskAssessment(
      ctx.orgId,
      input as RiskInput,
      { id: ctx.user!.openId, name: ctx.user!.name ?? ctx.user!.email ?? "Investigator", source: "dashboard" },
    )),
    importCsv: organizationManagerProcedure.input(z.object({
      fileName: z.string().trim().min(5).max(255).refine((name) => name.toLowerCase().endsWith(".csv"), "Upload a .csv file."),
      contentBase64: z.string().min(4).max(1_500_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, "The uploaded file is not valid base64 data."),
    })).mutation(async ({ ctx, input }) => {
      let file: Buffer;
      let content: string;
      try {
        file = Buffer.from(input.contentBase64, "base64");
        if (!file.length || file.length > 1_000_000) throw new Error("CSV files must be between 1 byte and 1 MB.");
        content = new TextDecoder("utf-8", { fatal: true }).decode(file);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "The CSV could not be decoded as UTF-8 text.");
      }

      const parsed = parseCsvImport(content);
      const errors = [...parsed.errors];
      const existingReferences = new Set(getRecords(ctx.orgId).map((record) => record.reference.toUpperCase()));
      Array.from(await getTransactionReferencesByOrganization(ctx.orgId)).forEach((reference) => existingReferences.add(reference));
      const acceptedReferences = new Set<string>();
      const importable = [] as typeof parsed.candidates;
      for (const candidate of parsed.candidates) {
        if (existingReferences.has(candidate.reference)) {
          errors.push({ row: candidate.row, field: "reference", message: "A transaction with this reference already exists in this workspace." });
        } else if (acceptedReferences.has(candidate.reference)) {
          errors.push({ row: candidate.row, field: "reference", message: "This reference is duplicated within the uploaded file." });
        } else {
          acceptedReferences.add(candidate.reference);
          importable.push(candidate);
        }
      }

      const records = importable.map((candidate) => createRiskRecord(candidate.input, candidate.reference));
      const workspaceRecords = getRecords(ctx.orgId);
      for (const record of records) {
        workspaceRecords.unshift(record);
        await persistTransaction(ctx.orgId, asInsertTransaction(record));
      }
      const riskDistribution = {
        high: records.filter((record) => record.riskLevel === "high").length,
        medium: records.filter((record) => record.riskLevel === "medium").length,
        low: records.filter((record) => record.riskLevel === "low").length,
      };
      const invalidRows = new Set(errors.filter((error) => error.row > 1).map((error) => error.row)).size;
      await recordAuditEvent({
        orgId: ctx.orgId,
        eventType: "transaction.csv_imported",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "transaction_import",
        subjectId: input.fileName,
        summary: `Imported ${records.length} transaction${records.length === 1 ? "" : "s"} from ${input.fileName}.`,
        metadata: { fileName: input.fileName, totalRows: parsed.totalRows, imported: records.length, invalidRows, highRisk: riskDistribution.high, mediumRisk: riskDistribution.medium, lowRisk: riskDistribution.low },
      });
      return {
        fileName: input.fileName,
        totalRows: parsed.totalRows,
        imported: records.length,
        invalidRows,
        duplicates: errors.filter((error) => error.message.toLowerCase().includes("duplicat") || error.message.toLowerCase().includes("already exists")).length,
        riskDistribution,
        errors: errors.slice(0, 100),
        importedRecords: records.map((record) => ({ id: record.id, reference: record.reference, riskLevel: record.riskLevel, probability: record.probability })),
      };
    }),
    updateCase: organizationProcedure.input(caseUpdateSchema).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      if (input.caseStatus !== "under_review" && !input.resolutionReasonCode) throw new Error("Select a resolution reason before closing a case.");
      const previousStatus = record.caseStatus;
      applyCaseUpdate(record, input);
      const actualOutcome = actualOutcomeForCaseStatus(record.caseStatus);
      const feedback = actualOutcome
        ? await upsertOutcomeFeedback({
          orgId: ctx.orgId,
          transactionId: record.id,
          predictedRiskLabel: record.riskLevel,
          predictedProbability: record.probability,
          actualOutcome,
          classification: classifyOutcome(record.riskLevel, actualOutcome),
          resolutionReasonCode: record.resolutionReasonCode,
          recordedById: ctx.user!.openId,
          recordedByName: ctx.user!.name ?? ctx.user!.email ?? "Investigator",
        })
        : null;
      if (!actualOutcome) await deleteOutcomeFeedback(ctx.orgId, record.id);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await addCaseComment({ orgId: ctx.orgId, transactionId: record.id, note: record.caseNote!, authorId: ctx.user!.openId, authorName: ctx.user!.name ?? ctx.user!.email ?? "Investigator" });
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.status_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Changed ${record.reference} from ${previousStatus} to ${record.caseStatus}.`, metadata: { previousStatus, caseStatus: record.caseStatus, resolutionReasonCode: record.resolutionReasonCode, noteAdded: Boolean(record.caseNote), actualOutcome: feedback?.actualOutcome ?? null, classification: feedback?.classification ?? null } });
      return record;
    }),
    evidenceStorageStatus: organizationProcedure.query(() => ({
      configured: isSupabaseStorageConfigured(),
      provider: "Supabase Storage",
      maximumAttachmentBytes: 5 * 1024 * 1024,
    })),
    collaboration: organizationProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (!getRecord(ctx.orgId, input.id)) throw new Error("Transaction not found");
      return getCaseCollaboration(ctx.orgId, input.id);
    }),
    addComment: organizationProcedure.input(z.object({ id: z.number().int().positive(), comment: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const actorName = ctx.user!.name ?? ctx.user!.email ?? "Investigator";
      await addCaseComment({ orgId: ctx.orgId, transactionId: record.id, note: input.comment, authorId: ctx.user!.openId, authorName: actorName });
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.comment_added", actorId: ctx.user!.openId, actorName, subjectType: "case", subjectId: String(record.id), summary: `Added an investigator comment to ${record.reference}.` });
      return { success: true };
    }),
    setTags: organizationProcedure.input(z.object({ id: z.number().int().positive(), tags: z.array(z.string().trim().min(1).max(48)).max(12) })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const tags = Array.from(new Set(input.tags.map((tag) => tag.toLowerCase())));
      await replaceCaseTags(ctx.orgId, record.id, tags);
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.tags_updated", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Updated investigation tags for ${record.reference}.`, metadata: { tags } });
      return { tags };
    }),
    addEvidenceLink: organizationProcedure.input(z.object({ id: z.number().int().positive(), label: z.string().trim().min(2).max(160), url: z.string().trim().url().refine((url) => url.startsWith("https://"), "Evidence links must use HTTPS.") })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      await addCaseEvidence({ orgId: ctx.orgId, transactionId: record.id, label: input.label, evidenceType: "link", url: input.url, addedById: ctx.user!.openId, addedByName: ctx.user!.name ?? ctx.user!.email });
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.evidence_link_added", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Added an evidence link to ${record.reference}.`, metadata: { label: input.label } });
      return { success: true };
    }),
    uploadEvidenceAttachment: organizationProcedure.input(z.object({ id: z.number().int().positive(), label: z.string().trim().min(2).max(160), fileName: z.string().trim().min(1).max(255), mimeType: z.enum(["application/pdf", "text/plain", "text/csv", "image/png", "image/jpeg"]), contentBase64: z.string().min(4).max(7_000_000) })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const content = decodeAndValidateEvidenceAttachment(input);
      const stored = await storagePut(createEvidenceStorageKey(ctx.orgId, record.id, input.fileName), content, input.mimeType);
      try {
        await addCaseEvidence({ orgId: ctx.orgId, transactionId: record.id, label: input.label, evidenceType: "attachment", url: stored.url, storageKey: stored.key, fileName: input.fileName, mimeType: input.mimeType, addedById: ctx.user!.openId, addedByName: ctx.user!.name ?? ctx.user!.email });
      } catch (error) {
        await storageDelete(stored.key).catch(() => undefined);
        throw error;
      }
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.evidence_attachment_added", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Added an evidence attachment to ${record.reference}.`, metadata: { label: input.label, fileName: input.fileName, mimeType: input.mimeType } });
      return { success: true };
    }),
    assignees: organizationProcedure.query(async ({ ctx }) => {
      const directory = await getWorkspaceDirectory(ctx.orgId);
      return directory.members.map((member) => ({ userId: member.userId, name: member.name, email: member.email, applicationRole: member.applicationRole }));
    }),
    claimCase: organizationProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      if (record.caseStatus !== "under_review") throw new Error("Only active cases can be assigned.");
      if (record.assigneeId && record.assigneeId !== ctx.user!.openId) throw new Error("This case is already assigned to another investigator.");
      const previousAssigneeId = record.assigneeId;
      record.assigneeId = ctx.user!.openId;
      record.assigneeName = ctx.user!.name ?? ctx.user!.email ?? "Assigned investigator";
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.claimed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Claimed case ${record.reference}.`, metadata: { previousAssigneeId, assigneeId: record.assigneeId } });
      return record;
    }),
    updateWorkflow: organizationManagerProcedure.input(caseWorkflowUpdateSchema).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      if (record.caseStatus !== "under_review") throw new Error("Only active cases can be updated.");
      let assigneeName: string | null = null;
      if (input.assigneeId) {
        const directory = await getWorkspaceDirectory(ctx.orgId);
        const assignee = directory.members.find((member) => member.userId === input.assigneeId);
        if (!assignee) throw new Error("Select an active member of this organization as the assignee.");
        assigneeName = assignee.name ?? assignee.email ?? "Assigned investigator";
      }
      const previous = { assigneeId: record.assigneeId, casePriority: record.casePriority, dueAt: record.dueAt?.toISOString() ?? null };
      applyCaseWorkflowUpdate(record, input, assigneeName);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.workflow_updated", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Updated assignment and service settings for ${record.reference}.`, metadata: { previous, assigneeId: record.assigneeId, casePriority: record.casePriority, dueAt: record.dueAt?.toISOString() ?? null } });
      return record;
    }),
    workload: organizationManagerProcedure.query(({ ctx }) => {
      const activeCases = getRecords(ctx.orgId).filter((record) => record.caseStatus === "under_review");
      const now = Date.now();
      const byAssignee = new Map<string, { userId: string; name: string; open: number; critical: number; overdue: number }>();
      for (const record of activeCases) {
        if (!record.assigneeId) continue;
        const current = byAssignee.get(record.assigneeId) ?? { userId: record.assigneeId, name: record.assigneeName ?? "Assigned investigator", open: 0, critical: 0, overdue: 0 };
        current.open += 1;
        if (record.casePriority === "critical") current.critical += 1;
        if (record.dueAt && record.dueAt.getTime() < now) current.overdue += 1;
        byAssignee.set(record.assigneeId, current);
      }
      const unassigned = activeCases.filter((record) => !record.assigneeId);
      return {
        active: activeCases.length,
        unassigned: unassigned.length,
        overdue: activeCases.filter((record) => record.dueAt && record.dueAt.getTime() < now).length,
        byAssignee: Array.from(byAssignee.values()).sort((first, second) => second.open - first.open || first.name.localeCompare(second.name)),
      };
    }),
    summarize: organizationProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const summary = await createInvestigatorSummary({
        riskLevel: record.riskLevel,
        probability: record.probability,
        factors: record.factors,
        deterministicExplanation: record.deterministicExplanation,
      });
      record.llmSummary = summary.summary;
      record.llmNextStep = summary.nextStep;
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      return { record, source: summary.source };
    }),
    modelHealth: organizationManagerProcedure.query(async ({ ctx }) => {
      const feedback = await getOutcomeFeedbackByOrganization(ctx.orgId);
      return buildModelQualityReport(feedback);
    }),
    drift: organizationManagerProcedure.query(() => driftDemo),
    persistenceStatus: organizationProcedure.query(async () => ({ connected: Boolean(await getDb()) })),
  }),
});

export type AppRouter = typeof appRouter;
