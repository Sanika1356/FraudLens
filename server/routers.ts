import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import {
  organizationAdministratorProcedure,
  organizationManagerProcedure,
  organizationProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
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
import {
  addCaseComment,
  addCaseEvidence,
  createApiKey,
  deleteOutcomeFeedback,
  getApiKeysByOrganization,
  activateRiskPolicy,
  createRiskPolicyDraft,
  getActiveRiskPolicy,
  getApiRequestLogsByOrganization,
  getRiskPoliciesByOrganization,
  getActiveRetentionPolicy,
  getRetentionPoliciesByOrganization,
  createRetentionPolicyDraft,
  activateRetentionPolicy,
  getModelRegistryByOrganization,
  getChampionModel,
  createModelRegistryCandidate,
  approveModelCandidate,
  rollbackModelChampion,
  getOrganizationControls,
  setIncidentMode,
  getAuditEventsByOrganization,
  getCaseChecklist,
  getCaseCollaboration,
  completeImportBatch,
  createImportBatch,
  getDb,
  getImportBatch,
  getImportBatchesByOrganization,
  getStoredRelatedActivity,
  upsertTransactionEntities,
  updateCaseChecklistItem,
  getSavedQueueViewsByOrganization,
  createSavedQueueView,
  deleteSavedQueueView,
  getNotificationPreferences,
  getOutcomeFeedbackByOrganization,
  getTransactionReferencesByOrganization,
  getWeeklySummaryPreferences,
  persistTransaction,
  recordAuditEvent,
  replaceCaseTags,
  revokeApiKey,
  upsertNotificationPreferences,
  upsertOutcomeFeedback,
  upsertWeeklySummaryPreferences,
} from "./db";
import {
  createEvidenceStorageKey,
  isSupabaseStorageConfigured,
  storageDelete,
  storagePut,
} from "./storage";
import { decodeAndValidateEvidenceAttachment } from "./evidenceFiles";
import { demoTransactions, driftDemo, RiskRecord } from "./demoData";
import { createInvestigatorSummary } from "./investigatorSummary";
import {
  buildModelQualityReport,
  buildThresholdAnalysis,
  classifyOutcome,
} from "./outcomeFeedback";
import {
  CASE_STATUSES,
  RISK_LEVELS,
  RiskInput,
  scoreTransaction,
} from "./riskEngine";
import type { DerivedRiskEntityInput } from "./db";
import {
  DEFAULT_RISK_POLICY,
  RiskPolicyConfig,
  normalizeRiskPolicy,
} from "./riskPolicy";
import { parseCsvImport } from "./csvImport";
import {
  ALERT_CHANNELS,
  createTestAlertTransaction,
  isAllowedSlackWebhookUrl,
  isAllowedTeamsWebhookUrl,
  sendAlertNotifications,
} from "./notifications";
import {
  buildOperationalReport,
  DEFAULT_REPORT_EXPORT_ROWS,
  MAX_REPORT_EXPORT_ROWS,
  reportFileName,
  reportToCsv,
  reportToText,
} from "./reports";
import {
  apiKeyDisclosureWarning,
  createApiKeySecret,
  parseApiKeyScopes,
  PUBLIC_API_KEY_SCOPE,
} from "./apiKeys";

export const riskInputSchema = z.object({
  amount: z.number().positive().max(1000000),
  merchantCategory: z.string().trim().min(2).max(80),
  transactionCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,3}$/),
  accountCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,3}$/),
  deviceStatus: z.enum(["known", "new"]),
  transactionHour: z.number().int().min(0).max(23),
  recentTransactionCount: z.number().int().min(0).max(50),
});

export const riskPolicySchema = z
  .object({
    highRiskThreshold: z.number().int().min(50).max(95),
    mediumRiskThreshold: z.number().int().min(10).max(94),
    highAmountThreshold: z.number().int().min(100).max(1000000),
    mediumAmountThreshold: z.number().int().min(50).max(999999),
    lowAmountThreshold: z.number().int().min(1).max(999998),
    highVelocityCount: z.number().int().min(2).max(50),
    mediumVelocityCount: z.number().int().min(1).max(49),
    policyHighValueAmount: z.number().int().min(100).max(1000000),
    policyVelocityCount: z.number().int().min(1).max(50),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.mediumRiskThreshold >= policy.highRiskThreshold)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediumRiskThreshold"],
        message: "Medium-risk threshold must be below the high-risk threshold.",
      });
    if (policy.mediumAmountThreshold >= policy.highAmountThreshold)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediumAmountThreshold"],
        message:
          "Medium amount threshold must be below the high amount threshold.",
      });
    if (policy.lowAmountThreshold >= policy.mediumAmountThreshold)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lowAmountThreshold"],
        message:
          "Low amount threshold must be below the medium amount threshold.",
      });
    if (policy.mediumVelocityCount >= policy.highVelocityCount)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediumVelocityCount"],
        message: "Medium velocity count must be below the high velocity count.",
      });
  });

const CASE_CHECKLIST_KEYS = [
  "identity_verification",
  "device_review",
  "merchant_review",
  "activity_review",
  "evidence_quality",
] as const;

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
export const SLA_STATES = [
  "on_track",
  "due_soon",
  "overdue",
  "no_deadline",
] as const;

export const queueViewFiltersSchema = z
  .object({
    queue: z.enum(["all", "mine", "unassigned"]).default("all"),
    priority: z.enum(CASE_PRIORITIES).optional(),
    slaState: z.enum(SLA_STATES).optional(),
  })
  .strict();

export const notificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean(),
    toEmail: z.string().trim().email().max(320).nullable(),
    slackEnabled: z.boolean(),
    slackWebhookUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(
        isAllowedSlackWebhookUrl,
        "Use a valid Slack incoming webhook URL."
      )
      .nullable(),
    teamsEnabled: z.boolean(),
    teamsWebhookUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(
        isAllowedTeamsWebhookUrl,
        "Use a valid Teams or Power Automate workflow URL."
      )
      .nullable(),
    riskThreshold: z.number().int().min(0).max(100),
  })
  .superRefine((preferences, context) => {
    if (preferences.emailEnabled && !preferences.toEmail)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toEmail"],
        message: "Provide an email recipient before enabling email alerts.",
      });
    if (preferences.slackEnabled && !preferences.slackWebhookUrl)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slackWebhookUrl"],
        message: "Provide a Slack webhook URL before enabling Slack alerts.",
      });
    if (preferences.teamsEnabled && !preferences.teamsWebhookUrl)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teamsWebhookUrl"],
        message: "Provide a Teams workflow URL before enabling Teams alerts.",
      });
  });
export const weeklySummaryPreferencesSchema = z
  .object({
    enabled: z.boolean(),
    toEmail: z.string().trim().email().max(320).nullable(),
  })
  .superRefine((preferences, context) => {
    if (preferences.enabled && !preferences.toEmail) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toEmail"],
        message: "Provide an email recipient before enabling weekly summaries.",
      });
    }
  });

export const caseWorkflowUpdateSchema = z.object({
  id: z.number().int().positive(),
  assigneeId: z.string().trim().min(1).max(64).nullable(),
  casePriority: z.enum(CASE_PRIORITIES),
  dueAt: z.date().nullable(),
});

export const reportFiltersSchema = z
  .object({
    riskLevel: z.enum(RISK_LEVELS).optional(),
    caseStatus: z.enum(CASE_STATUSES).optional(),
    assigneeId: z.string().trim().min(1).max(64).optional(),
    dateFrom: z.date().optional(),
    dateTo: z.date().optional(),
  })
  .superRefine((filters, context) => {
    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom > filters.dateTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "The report end date must be on or after the start date.",
      });
    }
  });

const retentionPolicySchema = z
  .object({
    transactionRetentionDays: z.number().int().min(30).max(3650),
    evidenceRetentionDays: z.number().int().min(30).max(3650),
    auditRetentionDays: z.number().int().min(90).max(3650),
    effectiveAt: z.date(),
  })
  .strict();
const retentionDraftSchema = retentionPolicySchema.extend({
  changeNote: z.string().trim().min(5).max(500),
});

const modelEvaluationSchema = z
  .object({
    precisionMilli: z.number().int().min(0).max(1000),
    recallMilli: z.number().int().min(0).max(1000),
    f1Milli: z.number().int().min(0).max(1000),
    prAucMilli: z.number().int().min(0).max(1000),
    threshold: z.number().min(0).max(1),
    reviewed: z.number().int().min(0).max(100000000),
  })
  .strict();
const modelCandidateSchema = z.object({
  modelKey: z.string().trim().min(2).max(80),
  version: z.string().trim().min(1).max(40),
  artifactHash: z.string().trim().min(8).max(128),
  datasetLabel: z.string().trim().min(3).max(250),
  evaluation: modelEvaluationSchema,
});
const modelCandidateDraftSchema = modelCandidateSchema.extend({
  changeNote: z.string().trim().min(5).max(500),
});

const reportExportSchema = z.object({
  filters: reportFiltersSchema.optional(),
  reason: z.string().trim().min(5).max(300),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(MAX_REPORT_EXPORT_ROWS)
    .default(DEFAULT_REPORT_EXPORT_ROWS),
});

const recordsByOrganization = new Map<string, RiskRecord[]>();
let nextId = Math.max(...demoTransactions.map(record => record.id)) + 1;

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
  return getRecords(orgId).find(record => record.id === id);
}

async function analyzeCsvImport(orgId: string, content: string) {
  const parsed = parseCsvImport(content);
  const errors = [...parsed.errors];
  const existingReferences = new Set(
    getRecords(orgId).map(record => record.reference.toUpperCase())
  );
  Array.from(await getTransactionReferencesByOrganization(orgId)).forEach(
    reference => existingReferences.add(reference)
  );
  const acceptedReferences = new Set<string>();
  const importable = [] as typeof parsed.candidates;
  for (const candidate of parsed.candidates) {
    if (existingReferences.has(candidate.reference)) {
      errors.push({
        row: candidate.row,
        field: "reference",
        message:
          "A transaction with this reference already exists in this workspace.",
      });
    } else if (acceptedReferences.has(candidate.reference)) {
      errors.push({
        row: candidate.row,
        field: "reference",
        message: "This reference is duplicated within the uploaded file.",
      });
    } else {
      acceptedReferences.add(candidate.reference);
      importable.push(candidate);
    }
  }
  const invalidRows = new Set(
    errors.filter(error => error.row > 1).map(error => error.row)
  ).size;
  const duplicates = errors.filter(
    error =>
      error.message.toLowerCase().includes("duplicat") ||
      error.message.toLowerCase().includes("already exists")
  ).length;
  return { parsed, errors, importable, invalidRows, duplicates };
}

export function applyCaseUpdate(
  record: RiskRecord,
  input: z.infer<typeof caseUpdateSchema>
) {
  record.caseStatus = input.caseStatus;
  record.caseNote = input.note.trim();
  record.resolutionReasonCode =
    input.caseStatus === "under_review"
      ? null
      : (input.resolutionReasonCode ?? null);
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
  assigneeName: string | null
) {
  record.assigneeId = input.assigneeId;
  record.assigneeName = assigneeName;
  record.casePriority = input.casePriority;
  record.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  return record;
}

export function deriveRiskEntities(input: RiskInput): DerivedRiskEntityInput[] {
  const category = input.merchantCategory.trim().toLowerCase();
  return [
    {
      entityType: "merchant_category",
      entityKey: category,
      displayLabel: `Merchant category · ${merchantName(category)}`,
      relationship: "Same merchant category",
    },
    {
      entityType: "country_route",
      entityKey: `${input.accountCountry}->${input.transactionCountry}`,
      displayLabel: `Country route · ${input.accountCountry} → ${input.transactionCountry}`,
      relationship: "Same account-to-transaction country route",
    },
    {
      entityType: "device_cohort",
      entityKey: `${input.deviceStatus}:${input.accountCountry}`,
      displayLabel: `${input.deviceStatus === "new" ? "New" : "Known"} device cohort · ${input.accountCountry}`,
      relationship: "Same synthetic device cohort",
    },
  ];
}

function createReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FRD-${suffix}`;
}

function merchantName(category: string) {
  return category
    .trim()
    .split(/\s+/)
    .map(part => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function riskInputFromRecord(record: RiskRecord): RiskInput {
  return {
    amount: record.amount,
    merchantCategory: record.merchantCategory,
    transactionCountry: record.transactionCountry,
    accountCountry: record.accountCountry,
    deviceStatus: record.deviceStatus,
    transactionHour: record.transactionHour,
    recentTransactionCount: record.recentTransactionCount,
  };
}

function createRiskRecord(
  input: RiskInput,
  reference = createReference(),
  policy = DEFAULT_RISK_POLICY,
  policyVersion = "v1"
): RiskRecord {
  const decision = scoreTransaction(input, policy);
  return {
    id: nextId++,
    reference,
    policyVersion,
    merchantName: merchantName(input.merchantCategory),
    createdAt: new Date(),
    caseStatus: "under_review",
    caseNote: null,
    resolutionReasonCode: null,
    assigneeId: null,
    assigneeName: null,
    casePriority:
      decision.riskLevel === "high"
        ? "critical"
        : decision.riskLevel === "medium"
          ? "high"
          : "standard",
    dueAt:
      decision.riskLevel === "high"
        ? new Date(Date.now() + 4 * 60 * 60 * 1000)
        : decision.riskLevel === "medium"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null,
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
    policyVersion: record.policyVersion,
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
    policySignalJson: JSON.stringify(record.policySignals),
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
  reference?: string
): Promise<RiskRecord> {
  const activePolicy = await getActiveRiskPolicy(orgId);
  const record = createRiskRecord(
    input,
    reference,
    activePolicy.config,
    `v${activePolicy.version}`
  );
  getRecords(orgId).unshift(record);
  await persistTransaction(orgId, asInsertTransaction(record));
  try {
    await upsertTransactionEntities(
      orgId,
      record.id,
      deriveRiskEntities(input)
    );
  } catch (error) {
    console.error("[FraudLens] Risk entity indexing failed", error);
  }
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
  void sendAlertNotifications(orgId, record).catch(error =>
    console.error("[FraudLens] Alert evaluation failed", error)
  );
  return record;
}

function summarizeApiKey(
  key: Awaited<ReturnType<typeof getApiKeysByOrganization>>[number]
) {
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

export function getSlaState(
  record: Pick<RiskRecord, "caseStatus" | "dueAt">,
  now = Date.now()
): (typeof SLA_STATES)[number] {
  if (record.caseStatus !== "under_review" || !record.dueAt)
    return "no_deadline";
  const dueAt = record.dueAt.getTime();
  if (dueAt < now) return "overdue";
  if (dueAt - now <= 24 * 60 * 60 * 1000) return "due_soon";
  return "on_track";
}

function decorateRiskRecord(record: RiskRecord) {
  return { ...record, slaState: getSlaState(record) };
}

function serializeQueueView(
  view: Awaited<ReturnType<typeof getSavedQueueViewsByOrganization>>[number]
) {
  let filters: z.infer<typeof queueViewFiltersSchema> = { queue: "all" };
  try {
    const parsed = JSON.parse(view.filtersJson) as unknown;
    const validated = queueViewFiltersSchema.safeParse(parsed);
    if (validated.success) filters = validated.data;
  } catch {
    /* Preserve a legacy view with safe defaults. */
  }
  return {
    id: view.id,
    name: view.name,
    visibility: view.visibility,
    ownerId: view.ownerId,
    createdByName: view.createdByName,
    filters,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

function webhookHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid-configured-url";
  }
}

function buildOverview(records: RiskRecord[]) {
  const total = records.length;
  const highRisk = records.filter(record => record.riskLevel === "high");
  const underReview = records.filter(
    record => record.caseStatus === "under_review"
  );
  const now = Date.now();
  return {
    total,
    highRisk: highRisk.length,
    underReview: underReview.length,
    newlyFlagged: records.filter(
      record => record.isNew && record.riskLevel === "high"
    ).length,
    averageProbability:
      total === 0
        ? 0
        : Math.round(
            records.reduce(
              (totalValue, record) => totalValue + record.probability,
              0
            ) / total
          ),
    riskDistribution: RISK_LEVELS.map(riskLevel => ({
      riskLevel,
      count: records.filter(record => record.riskLevel === riskLevel).length,
    })),
    highRiskAlerts: highRisk
      .filter(record => now - record.createdAt.getTime() < 1000 * 60 * 60 * 24)
      .slice(0, 5)
      .map(decorateRiskRecord),
    queue: [...records]
      .sort((first, second) => second.probability - first.probability)
      .slice(0, 6)
      .map(decorateRiskRecord),
  };
}

export const appRouter = router({
  system: systemRouter,
  policy: router({
    active: organizationManagerProcedure.query(({ ctx }) =>
      getActiveRiskPolicy(ctx.orgId)
    ),
    list: organizationManagerProcedure.query(({ ctx }) =>
      getRiskPoliciesByOrganization(ctx.orgId)
    ),
    preview: organizationManagerProcedure
      .input(riskPolicySchema)
      .query(async ({ ctx, input }) => {
        const active = await getActiveRiskPolicy(ctx.orgId);
        const proposed = normalizeRiskPolicy(input);
        const examples = getRecords(ctx.orgId)
          .slice(0, 12)
          .map(record => {
            const riskInput = riskInputFromRecord(record);
            const current = scoreTransaction(riskInput, active.config);
            const next = scoreTransaction(riskInput, proposed);
            return {
              id: record.id,
              reference: record.reference,
              current: {
                riskLevel: current.riskLevel,
                probability: current.probability,
              },
              proposed: {
                riskLevel: next.riskLevel,
                probability: next.probability,
              },
            };
          });
        const changedFields = Object.keys(proposed).filter(
          key =>
            proposed[key as keyof RiskPolicyConfig] !==
            active.config[key as keyof RiskPolicyConfig]
        );
        return {
          activeVersion: active.version,
          proposed,
          changedFields,
          examples,
          projectedHighRiskCurrent: getRecords(ctx.orgId).filter(
            record =>
              scoreTransaction(riskInputFromRecord(record), active.config)
                .riskLevel === "high"
          ).length,
          projectedHighRiskProposed: getRecords(ctx.orgId).filter(
            record =>
              scoreTransaction(riskInputFromRecord(record), proposed)
                .riskLevel === "high"
          ).length,
        };
      }),
    createDraft: organizationManagerProcedure
      .input(
        z.object({
          config: riskPolicySchema,
          changeNote: z.string().trim().min(5).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const draft = await createRiskPolicyDraft({
          orgId: ctx.orgId,
          config: input.config,
          changeNote: input.changeNote,
          createdById: ctx.user!.openId,
          createdByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "policy.draft_created",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "risk_policy",
          subjectId: String(draft.id),
          summary: `Created risk-policy draft v${draft.version}.`,
          metadata: { version: draft.version, changeNote: input.changeNote },
        });
        return draft;
      }),
    approve: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const activated = await activateRiskPolicy(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "policy.version_approved",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "risk_policy",
          subjectId: String(activated.id),
          summary: `Approved and activated risk policy v${activated.version}.`,
          metadata: { version: activated.version },
        });
        return activated;
      }),
    rollback: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const activated = await activateRiskPolicy(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "policy.version_rolled_back",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "risk_policy",
          subjectId: String(activated.id),
          summary: `Rolled back to risk policy v${activated.version}.`,
          metadata: { version: activated.version },
        });
        return activated;
      }),
  }),
  retention: router({
    active: organizationManagerProcedure.query(({ ctx }) =>
      getActiveRetentionPolicy(ctx.orgId)
    ),
    list: organizationManagerProcedure.query(({ ctx }) =>
      getRetentionPoliciesByOrganization(ctx.orgId)
    ),
    preview: organizationManagerProcedure
      .input(retentionPolicySchema)
      .query(async ({ ctx, input }) => {
        const active = await getActiveRetentionPolicy(ctx.orgId);
        const proposed = {
          ...input,
          effectiveAt: new Date(input.effectiveAt),
        };
        const changedFields = [
          ...(proposed.transactionRetentionDays !==
          active.transactionRetentionDays
            ? ["transactionRetentionDays"]
            : []),
          ...(proposed.evidenceRetentionDays !== active.evidenceRetentionDays
            ? ["evidenceRetentionDays"]
            : []),
          ...(proposed.auditRetentionDays !== active.auditRetentionDays
            ? ["auditRetentionDays"]
            : []),
          ...(proposed.effectiveAt.getTime() !== active.effectiveAt.getTime()
            ? ["effectiveAt"]
            : []),
        ];
        const now = Date.now();
        return {
          activeVersion: active.version,
          proposed,
          changedFields,
          deletionEnabled: false,
          transactionRecordsEligibleAfter: new Date(
            now - input.transactionRetentionDays * 24 * 60 * 60 * 1000
          ),
          evidenceEligibleAfter: new Date(
            now - input.evidenceRetentionDays * 24 * 60 * 60 * 1000
          ),
          auditEligibleAfter: new Date(
            now - input.auditRetentionDays * 24 * 60 * 60 * 1000
          ),
        };
      }),
    createDraft: organizationManagerProcedure
      .input(retentionDraftSchema)
      .mutation(async ({ ctx, input }) => {
        const draft = await createRetentionPolicyDraft({
          ...input,
          orgId: ctx.orgId,
          createdById: ctx.user!.openId,
          createdByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "retention.draft_created",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "retention_policy",
          subjectId: String(draft.id),
          summary: `Created retention-policy draft v${draft.version}.`,
          metadata: { version: draft.version, changeNote: input.changeNote },
        });
        return draft;
      }),
    approve: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const activated = await activateRetentionPolicy(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "retention.version_approved",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "retention_policy",
          subjectId: String(activated.id),
          summary: `Approved and activated retention policy v${activated.version}.`,
          metadata: {
            version: activated.version,
            effectiveAt: activated.effectiveAt,
          },
        });
        return activated;
      }),
    rollback: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const activated = await activateRetentionPolicy(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "retention.version_rolled_back",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "retention_policy",
          subjectId: String(activated.id),
          summary: `Rolled back to retention policy v${activated.version}.`,
          metadata: { version: activated.version },
        });
        return activated;
      }),
  }),
  modelRegistry: router({
    active: organizationManagerProcedure.query(({ ctx }) =>
      getChampionModel(ctx.orgId)
    ),
    list: organizationManagerProcedure.query(({ ctx }) =>
      getModelRegistryByOrganization(ctx.orgId)
    ),
    preview: organizationManagerProcedure
      .input(modelCandidateSchema)
      .query(async ({ ctx, input }) => {
        const champion = await getChampionModel(ctx.orgId);
        return {
          champion: {
            version: champion.version,
            evaluation: champion.evaluation,
          },
          challenger: input,
          changedMetrics: Object.keys(input.evaluation).filter(
            key =>
              input.evaluation[key as keyof typeof input.evaluation] !==
              champion.evaluation[key as keyof typeof champion.evaluation]
          ),
          changesLiveScoring: false,
          requiresApproval: true,
        };
      }),
    createChallenger: organizationManagerProcedure
      .input(modelCandidateDraftSchema)
      .mutation(async ({ ctx, input }) => {
        const candidate = await createModelRegistryCandidate({
          ...input,
          orgId: ctx.orgId,
          createdById: ctx.user!.openId,
          createdByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "model_registry.challenger_created",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "model_registry",
          subjectId: String(candidate.id),
          summary: `Registered model challenger ${candidate.version}.`,
          metadata: {
            modelKey: candidate.modelKey,
            version: candidate.version,
            changeNote: input.changeNote,
          },
        });
        return candidate;
      }),
    approve: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const champion = await approveModelCandidate(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "model_registry.champion_approved",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "model_registry",
          subjectId: String(champion.id),
          summary: `Approved model champion ${champion.version}.`,
          metadata: { modelKey: champion.modelKey, version: champion.version },
        });
        return champion;
      }),
    rollback: organizationAdministratorProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const champion = await rollbackModelChampion(
          ctx.orgId!,
          input.id,
          ctx.user!.openId,
          ctx.user!.name ?? ctx.user!.email
        );
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "model_registry.champion_rolled_back",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "model_registry",
          subjectId: String(champion.id),
          summary: `Rolled back model champion to ${champion.version}.`,
          metadata: { modelKey: champion.modelKey, version: champion.version },
        });
        return champion;
      }),
  }),
  queueViews: router({
    list: organizationProcedure.query(async ({ ctx }) => {
      const views = await getSavedQueueViewsByOrganization(
        ctx.orgId,
        ctx.user!.openId
      );
      return views.map(serializeQueueView);
    }),
    create: organizationProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(80),
          visibility: z.enum(["private", "shared"]).default("private"),
          filters: queueViewFiltersSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const effectiveRole = ctx.appRole ?? ctx.user!.role;
        if (
          input.visibility === "shared" &&
          !["manager", "admin"].includes(effectiveRole)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and administrators can share queue views.",
          });
        }
        const view = await createSavedQueueView({
          orgId: ctx.orgId,
          ownerId: ctx.user!.openId,
          name: input.name,
          visibility: input.visibility,
          filters: input.filters,
          createdByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "queue.saved_view_created",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "queue_view",
          subjectId: String(view.id),
          summary: `Created ${input.visibility} queue view ${input.name}.`,
          metadata: { visibility: input.visibility, filters: input.filters },
        });
        return serializeQueueView(view);
      }),
    delete: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const effectiveRole = ctx.appRole ?? ctx.user!.role;
        const deleted = await deleteSavedQueueView(
          ctx.orgId,
          input.id,
          ctx.user!.openId,
          ["manager", "admin"].includes(effectiveRole)
        );
        if (!deleted)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue view not found or not owned by this user.",
          });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "queue.saved_view_deleted",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "queue_view",
          subjectId: String(input.id),
          summary: "Deleted a saved queue view.",
        });
        return { id: input.id };
      }),
  }),
  security: router({
    overview: organizationManagerProcedure.query(async ({ ctx }) => {
      const [events, keys, preferences, controls] = await Promise.all([
        getAuditEventsByOrganization(ctx.orgId),
        getApiKeysByOrganization(ctx.orgId),
        getNotificationPreferences(ctx.orgId),
        getOrganizationControls(ctx.orgId),
      ]);
      const review = events.find(
        event => event.eventType === "security.access_review_completed"
      );
      return {
        lastAccessReview: review
          ? {
              createdAt: review.createdAt,
              actorName: review.actorName,
              summary: review.summary,
            }
          : null,
        apiKeys: keys.map(key => ({
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          scopes: parseApiKeyScopes(key.scopesJson),
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt,
        })),
        incidentMode: controls,
        webhooks: [
          {
            channel: "Slack",
            enabled: preferences.slackEnabled,
            host: webhookHost(preferences.slackWebhookUrl),
          },
          {
            channel: "Teams",
            enabled: preferences.teamsEnabled,
            host: webhookHost(preferences.teamsWebhookUrl),
          },
        ],
        recentEvents: events.slice(0, 30),
      };
    }),
    controls: organizationManagerProcedure.query(({ ctx }) =>
      getOrganizationControls(ctx.orgId)
    ),
    setIncidentMode: organizationAdministratorProcedure
      .input(
        z
          .object({
            enabled: z.boolean(),
            note: z.string().trim().max(500).optional(),
          })
          .superRefine((input, refinementContext) => {
            if (input.enabled && (!input.note || input.note.length < 5)) {
              refinementContext.addIssue({
                code: "custom",
                path: ["note"],
                message:
                  "An incident note of at least five characters is required.",
              });
            }
          })
      )
      .mutation(async ({ ctx, input }) => {
        const controls = await setIncidentMode({
          orgId: ctx.orgId!,
          enabled: input.enabled,
          note: input.note ?? null,
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: input.enabled
            ? "security.incident_mode_enabled"
            : "security.incident_mode_disabled",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "workspace",
          subjectId: ctx.orgId!,
          summary: input.enabled
            ? "Enabled workspace incident mode; organization writes are suspended."
            : "Disabled workspace incident mode; organization writes are restored.",
          metadata: input.enabled ? { note: input.note } : {},
        });
        return controls;
      }),
    completeAccessReview: organizationAdministratorProcedure
      .input(z.object({ note: z.string().trim().min(3).max(300) }))
      .mutation(async ({ ctx, input }) => {
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "security.access_review_completed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "workspace",
          subjectId: ctx.orgId!,
          summary: "Completed an organization access and integration review.",
          metadata: { note: input.note },
        });
        return { completedAt: new Date(), note: input.note };
      }),
  }),
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
      return ctx.user
        ? { ...ctx.user, role: ctx.appRole ?? ctx.user.role }
        : null;
    }),
  }),
  notifications: router({
    get: organizationManagerProcedure.query(({ ctx }) =>
      getNotificationPreferences(ctx.orgId)
    ),
    update: organizationManagerProcedure
      .input(notificationPreferencesSchema)
      .mutation(async ({ ctx, input }) => {
        const preferences = await upsertNotificationPreferences(
          ctx.orgId,
          input
        );
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
    testAlert: organizationManagerProcedure
      .input(
        z.object({ channel: z.enum(ALERT_CHANNELS).optional() }).optional()
      )
      .mutation(async ({ ctx, input }) => {
        const channels = input?.channel ? [input.channel] : undefined;
        const results = await sendAlertNotifications(
          ctx.orgId,
          createTestAlertTransaction(),
          100,
          { force: true, channels }
        );
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "notifications.test_alert_sent",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "notification_preferences",
          subjectId: ctx.orgId,
          summary: `Sent a test alert${input?.channel ? ` through ${input.channel}` : " through configured channels"}.`,
          metadata: {
            channels: channels ?? ALERT_CHANNELS,
            results: results.map(result => ({
              channel: result.channel,
              status: result.status,
            })),
          },
        });
        return { results };
      }),
  }),
  weeklySummaries: router({
    get: organizationManagerProcedure.query(({ ctx }) =>
      getWeeklySummaryPreferences(ctx.orgId)
    ),
    update: organizationManagerProcedure
      .input(weeklySummaryPreferencesSchema)
      .mutation(async ({ ctx, input }) => {
        const preferences = await upsertWeeklySummaryPreferences(
          ctx.orgId,
          input
        );
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "weekly_summary.preferences_updated",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "weekly_summary_preferences",
          subjectId: String(preferences.id),
          summary: `${preferences.enabled ? "Enabled" : "Disabled"} automatic weekly risk summaries.`,
          metadata: {
            enabled: preferences.enabled,
            hasRecipient: Boolean(preferences.toEmail),
          },
        });
        return preferences;
      }),
  }),
  apiKeys: router({
    list: organizationManagerProcedure.query(async ({ ctx }) => {
      const keys = await getApiKeysByOrganization(ctx.orgId);
      return keys.map(summarizeApiKey);
    }),
    create: organizationManagerProcedure
      .input(
        z.object({
          name: z.string().trim().min(3).max(80),
          expiresAt: z.date().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.expiresAt && input.expiresAt <= new Date())
          throw new Error("An API key expiry date must be in the future.");
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
          metadata: {
            scopes: [PUBLIC_API_KEY_SCOPE],
            expiresAt: key.expiresAt?.toISOString() ?? null,
          },
        });
        return {
          apiKey: summarizeApiKey(key),
          secret: issued.secret,
          disclosureWarning: apiKeyDisclosureWarning(),
        };
      }),
    revoke: organizationManagerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
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
    requestLogs: organizationManagerProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(200).default(100) })
          .optional()
      )
      .query(({ ctx, input }) =>
        getApiRequestLogsByOrganization(ctx.orgId, input?.limit ?? 100)
      ),
  }),
  audit: router({
    list: organizationManagerProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(200).default(100) })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const events = await getAuditEventsByOrganization(
          ctx.orgId,
          input?.limit ?? 100
        );
        return events.map(event => {
          let metadata: Record<string, unknown> = {};
          try {
            metadata = JSON.parse(event.metadataJson) as Record<
              string,
              unknown
            >;
          } catch {
            /* preserve the event if legacy metadata is malformed */
          }
          return { ...event, metadata };
        });
      }),
  }),
  administration: router({
    directory: organizationAdministratorProcedure.query(({ ctx }) =>
      getWorkspaceDirectory(ctx.orgId!)
    ),
    invite: organizationAdministratorProcedure
      .input(
        z.object({
          emailAddress: z.string().trim().email().max(320),
          organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const invitation = await inviteOrganizationMember({
          orgId: ctx.orgId!,
          inviterUserId: ctx.user!.openId,
          emailAddress: input.emailAddress,
          role: input.organizationRole,
        });
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.member_invited",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "invitation",
          subjectId: invitation.id,
          summary: "Invited a member to the workspace.",
          metadata: { organizationRole: invitation.role },
        });
        return {
          id: invitation.id,
          email: invitation.emailAddress,
          role: invitation.role,
          status: invitation.status,
        };
      }),
    updateOrganizationRole: organizationAdministratorProcedure
      .input(
        z.object({
          userId: z.string().trim().min(1).max(64),
          organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const membership = await changeOrganizationMembershipRole({
          orgId: ctx.orgId!,
          actorUserId: ctx.user!.openId,
          userId: input.userId,
          role: input.organizationRole,
        });
        const userId = membership.publicUserData?.userId ?? input.userId;
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.organization_role_changed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "member",
          subjectId: userId,
          summary: "Changed a member's organization role.",
          metadata: { organizationRole: membership.role },
        });
        return { userId, organizationRole: membership.role };
      }),
    updateFraudLensRole: organizationAdministratorProcedure
      .input(
        z.object({
          userId: z.string().trim().min(1).max(64),
          applicationRole: z.enum(FRAUDLENS_ROLES),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await changeFraudLensRole({
          orgId: ctx.orgId!,
          actorUserId: ctx.user!.openId,
          userId: input.userId,
          role: input.applicationRole,
        });
        const applicationRole = user?.role ?? input.applicationRole;
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.application_role_changed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "member",
          subjectId: input.userId,
          summary: "Changed a member's FraudLens role.",
          metadata: { applicationRole },
        });
        return { userId: input.userId, applicationRole };
      }),
    deactivateMember: organizationAdministratorProcedure
      .input(
        z.object({
          userId: z.string().trim().min(1).max(64),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await deactivateOrganizationMember({
          orgId: ctx.orgId!,
          actorUserId: ctx.user!.openId,
          userId: input.userId,
        });
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.member_deactivated",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "member",
          subjectId: input.userId,
          summary: "Deactivated a member's access to this workspace.",
        });
        return { userId: input.userId };
      }),
    revokeSessions: organizationAdministratorProcedure
      .input(
        z.object({
          userId: z.string().trim().min(1).max(64),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await revokeMemberSessions({
          orgId: ctx.orgId!,
          actorUserId: ctx.user!.openId,
          userId: input.userId,
        });
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.sessions_revoked",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "member",
          subjectId: input.userId,
          summary: "Revoked a member's active sessions.",
          metadata: { revokedCount: result.revokedCount },
        });
        return result;
      }),
    revokeInvitation: organizationAdministratorProcedure
      .input(
        z.object({
          invitationId: z.string().trim().min(1).max(64),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await revokeOrganizationInvitation({
          orgId: ctx.orgId!,
          actorUserId: ctx.user!.openId,
          invitationId: input.invitationId,
        });
        await recordAuditEvent({
          orgId: ctx.orgId!,
          eventType: "administration.invitation_revoked",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "invitation",
          subjectId: input.invitationId,
          summary: "Revoked a pending workspace invitation.",
        });
        return { invitationId: input.invitationId };
      }),
  }),
  reports: router({
    overview: organizationManagerProcedure
      .input(reportFiltersSchema.optional())
      .query(async ({ ctx, input }) => {
        const feedback = await getOutcomeFeedbackByOrganization(ctx.orgId);
        return buildOperationalReport(
          getRecords(ctx.orgId),
          feedback,
          input ?? {}
        );
      }),
    downloadCsv: organizationManagerProcedure
      .input(reportExportSchema)
      .mutation(async ({ ctx, input }) => {
        const report = buildOperationalReport(
          getRecords(ctx.orgId),
          await getOutcomeFeedbackByOrganization(ctx.orgId),
          input.filters ?? {},
          new Date(),
          input.rowLimit
        );
        const fileName = reportFileName("csv", report.generatedAt);
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "report.csv_exported",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "operational_report",
          subjectId: fileName,
          summary: `Exported a filtered operational CSV report (${report.summary.assessed} transaction${report.summary.assessed === 1 ? "" : "s"}).`,
          metadata: {
            filters: input.filters ?? {},
            assessed: report.summary.assessed,
            rowLimit: input.rowLimit,
            reason: input.reason,
          },
        });
        return {
          fileName,
          content: reportToCsv(report),
          contentType: "text/csv;charset=utf-8",
        };
      }),
    downloadSummary: organizationManagerProcedure
      .input(reportExportSchema)
      .mutation(async ({ ctx, input }) => {
        const report = buildOperationalReport(
          getRecords(ctx.orgId),
          await getOutcomeFeedbackByOrganization(ctx.orgId),
          input.filters ?? {},
          new Date(),
          input.rowLimit
        );
        const fileName = reportFileName("txt", report.generatedAt);
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "report.summary_downloaded",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "operational_report",
          subjectId: fileName,
          summary: `Downloaded an operational report summary (${report.summary.assessed} transaction${report.summary.assessed === 1 ? "" : "s"}).`,
          metadata: {
            filters: input.filters ?? {},
            assessed: report.summary.assessed,
            rowLimit: input.rowLimit,
            reason: input.reason,
          },
        });
        return {
          fileName,
          content: reportToText(report),
          contentType: "text/plain;charset=utf-8",
        };
      }),
  }),
  risk: router({
    overview: organizationProcedure.query(({ ctx }) =>
      buildOverview(getRecords(ctx.orgId))
    ),
    list: organizationProcedure
      .input(
        z
          .object({
            riskLevel: z.enum(RISK_LEVELS).optional(),
            caseStatus: z.enum(CASE_STATUSES).optional(),
            casePriority: z.enum(CASE_PRIORITIES).optional(),
            slaState: z.enum(SLA_STATES).optional(),
            assigneeId: z.string().trim().min(1).max(64).optional(),
            unassignedOnly: z.boolean().optional(),
            merchantCategory: z.string().trim().max(80).optional(),
            dateFrom: z.date().optional(),
            dateTo: z.date().optional(),
          })
          .optional()
      )
      .query(({ ctx, input }) => {
        const filtered = getRecords(ctx.orgId).filter(record => {
          if (input?.riskLevel && record.riskLevel !== input.riskLevel)
            return false;
          if (input?.caseStatus && record.caseStatus !== input.caseStatus)
            return false;
          if (input?.casePriority && record.casePriority !== input.casePriority)
            return false;
          if (input?.slaState && getSlaState(record) !== input.slaState)
            return false;
          if (input?.assigneeId && record.assigneeId !== input.assigneeId)
            return false;
          if (input?.unassignedOnly && record.assigneeId !== null) return false;
          if (
            input?.merchantCategory &&
            record.merchantCategory.toLowerCase() !==
              input.merchantCategory.toLowerCase()
          )
            return false;
          if (input?.dateFrom && record.createdAt < input.dateFrom)
            return false;
          if (input?.dateTo && record.createdAt > input.dateTo) return false;
          return true;
        });
        return [...filtered]
          .sort(
            (first, second) =>
              second.createdAt.getTime() - first.createdAt.getTime()
          )
          .map(decorateRiskRecord);
      }),
    detail: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        return record ? decorateRiskRecord(record) : null;
      }),
    relatedActivity: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found in this organization.",
          });
        const stored = await getStoredRelatedActivity(ctx.orgId, input.id);
        if (stored.length) return stored;
        const entities = deriveRiskEntities(record);
        return entities.map(entity => ({
          entityType: entity.entityType,
          displayLabel: entity.displayLabel,
          relationship: entity.relationship,
          relatedTransactions: getRecords(ctx.orgId)
            .filter(
              candidate =>
                candidate.id !== record.id &&
                deriveRiskEntities(candidate).some(
                  linked =>
                    linked.entityType === entity.entityType &&
                    linked.entityKey === entity.entityKey
                )
            )
            .slice(0, 6)
            .map(candidate => ({
              id: candidate.id,
              reference: candidate.reference,
              merchantName: candidate.merchantName,
              riskLevel: candidate.riskLevel,
              caseStatus: candidate.caseStatus,
              createdAt: candidate.createdAt,
            })),
        }));
      }),
    assess: organizationProcedure
      .input(riskInputSchema)
      .mutation(async ({ ctx, input }) =>
        submitRiskAssessment(ctx.orgId, input as RiskInput, {
          id: ctx.user!.openId,
          name: ctx.user!.name ?? ctx.user!.email ?? "Investigator",
          source: "dashboard",
        })
      ),
    previewCsv: organizationManagerProcedure
      .input(
        z.object({
          fileName: z
            .string()
            .trim()
            .min(5)
            .max(255)
            .refine(
              name => name.toLowerCase().endsWith(".csv"),
              "Upload a .csv file."
            ),
          contentBase64: z
            .string()
            .min(4)
            .max(1_500_000)
            .regex(
              /^[A-Za-z0-9+/]+={0,2}$/,
              "The uploaded file is not valid base64 data."
            ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let content: string;
        try {
          const file = Buffer.from(input.contentBase64, "base64");
          if (!file.length || file.length > 1_000_000)
            throw new Error("CSV files must be between 1 byte and 1 MB.");
          content = new TextDecoder("utf-8", { fatal: true }).decode(file);
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? error.message
              : "The CSV could not be decoded as UTF-8 text."
          );
        }
        const analyzed = await analyzeCsvImport(ctx.orgId, content);
        const batch = await createImportBatch({
          orgId: ctx.orgId,
          fileName: input.fileName,
          contentHash: createHash("sha256").update(content).digest("hex"),
          totalRows: analyzed.parsed.totalRows,
          readyRows: analyzed.importable.length,
          invalidRows: analyzed.invalidRows,
          duplicateRows: analyzed.duplicates,
          errors: analyzed.errors,
          createdById: ctx.user!.openId,
          createdByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "transaction.csv_import_previewed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "transaction_import",
          subjectId: String(batch.id),
          summary: `Previewed ${input.fileName} with ${analyzed.importable.length} ready row${analyzed.importable.length === 1 ? "" : "s"}.`,
          metadata: {
            fileName: input.fileName,
            totalRows: analyzed.parsed.totalRows,
            readyRows: analyzed.importable.length,
            invalidRows: analyzed.invalidRows,
            duplicates: analyzed.duplicates,
          },
        });
        return {
          batchId: batch.id,
          fileName: input.fileName,
          totalRows: analyzed.parsed.totalRows,
          readyRows: analyzed.importable.length,
          invalidRows: analyzed.invalidRows,
          duplicates: analyzed.duplicates,
          errors: analyzed.errors.slice(0, 100),
          sampleRows: analyzed.importable.slice(0, 20).map(candidate => {
            const decision = scoreTransaction(candidate.input);
            return {
              row: candidate.row,
              reference: candidate.reference,
              amount: candidate.input.amount,
              merchantCategory: candidate.input.merchantCategory,
              riskLevel: decision.riskLevel,
              probability: decision.probability,
            };
          }),
        };
      }),
    importHistory: organizationManagerProcedure.query(({ ctx }) =>
      getImportBatchesByOrganization(ctx.orgId)
    ),
    importCsv: organizationManagerProcedure
      .input(
        z.object({
          fileName: z
            .string()
            .trim()
            .min(5)
            .max(255)
            .refine(
              name => name.toLowerCase().endsWith(".csv"),
              "Upload a .csv file."
            ),
          contentBase64: z
            .string()
            .min(4)
            .max(1_500_000)
            .regex(
              /^[A-Za-z0-9+/]+={0,2}$/,
              "The uploaded file is not valid base64 data."
            ),
          batchId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let file: Buffer;
        let content: string;
        try {
          file = Buffer.from(input.contentBase64, "base64");
          if (!file.length || file.length > 1_000_000)
            throw new Error("CSV files must be between 1 byte and 1 MB.");
          content = new TextDecoder("utf-8", { fatal: true }).decode(file);
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? error.message
              : "The CSV could not be decoded as UTF-8 text."
          );
        }

        const analyzed = await analyzeCsvImport(ctx.orgId, content);
        const contentHash = createHash("sha256").update(content).digest("hex");
        if (input.batchId) {
          const batch = await getImportBatch(ctx.orgId, input.batchId);
          if (!batch)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Import preview not found in this workspace.",
            });
          if (batch.contentHash !== contentHash)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "The uploaded file changed after preview. Preview it again before importing.",
            });
          if (batch.status !== "previewed")
            throw new TRPCError({
              code: "CONFLICT",
              message: "This import preview has already been completed.",
            });
        }
        const { parsed, errors, importable } = analyzed;
        const activePolicy = await getActiveRiskPolicy(ctx.orgId);
        const records = importable.map(candidate =>
          createRiskRecord(
            candidate.input,
            candidate.reference,
            activePolicy.config,
            `v${activePolicy.version}`
          )
        );
        const workspaceRecords = getRecords(ctx.orgId);
        for (const record of records) {
          workspaceRecords.unshift(record);
          await persistTransaction(ctx.orgId, asInsertTransaction(record));
          try {
            await upsertTransactionEntities(
              ctx.orgId,
              record.id,
              deriveRiskEntities(record)
            );
          } catch (error) {
            console.error(
              "[FraudLens] Risk entity indexing failed during import",
              error
            );
          }
        }
        if (input.batchId)
          await completeImportBatch(ctx.orgId, input.batchId, {
            status: "completed",
            importedRows: records.length,
          });
        const riskDistribution = {
          high: records.filter(record => record.riskLevel === "high").length,
          medium: records.filter(record => record.riskLevel === "medium")
            .length,
          low: records.filter(record => record.riskLevel === "low").length,
        };
        const invalidRows = analyzed.invalidRows;
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "transaction.csv_imported",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "transaction_import",
          subjectId: input.fileName,
          summary: `Imported ${records.length} transaction${records.length === 1 ? "" : "s"} from ${input.fileName}.`,
          metadata: {
            fileName: input.fileName,
            totalRows: parsed.totalRows,
            imported: records.length,
            invalidRows,
            highRisk: riskDistribution.high,
            mediumRisk: riskDistribution.medium,
            lowRisk: riskDistribution.low,
          },
        });
        return {
          fileName: input.fileName,
          totalRows: parsed.totalRows,
          imported: records.length,
          invalidRows,
          duplicates: analyzed.duplicates,
          batchId: input.batchId ?? null,
          riskDistribution,
          errors: errors.slice(0, 100),
          importedRecords: records.map(record => ({
            id: record.id,
            reference: record.reference,
            riskLevel: record.riskLevel,
            probability: record.probability,
          })),
        };
      }),
    updateCase: organizationProcedure
      .input(caseUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        if (input.caseStatus !== "under_review" && !input.resolutionReasonCode)
          throw new Error("Select a resolution reason before closing a case.");
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
              recordedByName:
                ctx.user!.name ?? ctx.user!.email ?? "Investigator",
            })
          : null;
        if (!actualOutcome) await deleteOutcomeFeedback(ctx.orgId, record.id);
        await persistTransaction(ctx.orgId, asInsertTransaction(record));
        await addCaseComment({
          orgId: ctx.orgId,
          transactionId: record.id,
          note: record.caseNote!,
          authorId: ctx.user!.openId,
          authorName: ctx.user!.name ?? ctx.user!.email ?? "Investigator",
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.status_changed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Changed ${record.reference} from ${previousStatus} to ${record.caseStatus}.`,
          metadata: {
            previousStatus,
            caseStatus: record.caseStatus,
            resolutionReasonCode: record.resolutionReasonCode,
            noteAdded: Boolean(record.caseNote),
            actualOutcome: feedback?.actualOutcome ?? null,
            classification: feedback?.classification ?? null,
          },
        });
        return record;
      }),
    evidenceStorageStatus: organizationProcedure.query(() => ({
      configured: isSupabaseStorageConfigured(),
      provider: "Supabase Storage",
      maximumAttachmentBytes: 5 * 1024 * 1024,
    })),
    checklist: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        if (!getRecord(ctx.orgId, input.id))
          throw new Error("Transaction not found");
        const items = await getCaseChecklist(ctx.orgId, input.id);
        return {
          items,
          completedCount: items.filter(item => item.completed).length,
          totalCount: items.length,
        };
      }),
    updateChecklist: organizationProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          itemKey: z.enum(CASE_CHECKLIST_KEYS),
          completed: z.boolean(),
          note: z.string().trim().max(500).default(""),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        const item = await updateCaseChecklistItem({
          orgId: ctx.orgId,
          transactionId: record.id,
          itemKey: input.itemKey,
          completed: input.completed,
          note: input.note,
          completedById: ctx.user!.openId,
          completedByName: ctx.user!.name ?? ctx.user!.email ?? "Investigator",
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.checklist_updated",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `${input.completed ? "Completed" : "Reopened"} checklist item for ${record.reference}.`,
          metadata: {
            itemKey: input.itemKey,
            completed: input.completed,
          },
        });
        const items = await getCaseChecklist(ctx.orgId, record.id);
        return {
          item,
          completedCount: items.filter(checklistItem => checklistItem.completed)
            .length,
          totalCount: items.length,
        };
      }),
    collaboration: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        if (!getRecord(ctx.orgId, input.id))
          throw new Error("Transaction not found");
        return getCaseCollaboration(ctx.orgId, input.id);
      }),
    addComment: organizationProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          comment: z.string().trim().min(1).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        const actorName = ctx.user!.name ?? ctx.user!.email ?? "Investigator";
        await addCaseComment({
          orgId: ctx.orgId,
          transactionId: record.id,
          note: input.comment,
          authorId: ctx.user!.openId,
          authorName: actorName,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.comment_added",
          actorId: ctx.user!.openId,
          actorName,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Added an investigator comment to ${record.reference}.`,
        });
        return { success: true };
      }),
    setTags: organizationProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          tags: z.array(z.string().trim().min(1).max(48)).max(12),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        const tags = Array.from(
          new Set(input.tags.map(tag => tag.toLowerCase()))
        );
        await replaceCaseTags(ctx.orgId, record.id, tags);
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.tags_updated",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Updated investigation tags for ${record.reference}.`,
          metadata: { tags },
        });
        return { tags };
      }),
    addEvidenceLink: organizationProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          label: z.string().trim().min(2).max(160),
          url: z
            .string()
            .trim()
            .url()
            .refine(
              url => url.startsWith("https://"),
              "Evidence links must use HTTPS."
            ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        await addCaseEvidence({
          orgId: ctx.orgId,
          transactionId: record.id,
          label: input.label,
          evidenceType: "link",
          url: input.url,
          addedById: ctx.user!.openId,
          addedByName: ctx.user!.name ?? ctx.user!.email,
        });
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.evidence_link_added",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Added an evidence link to ${record.reference}.`,
          metadata: { label: input.label },
        });
        return { success: true };
      }),
    uploadEvidenceAttachment: organizationProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          label: z.string().trim().min(2).max(160),
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.enum([
            "application/pdf",
            "text/plain",
            "text/csv",
            "image/png",
            "image/jpeg",
          ]),
          contentBase64: z.string().min(4).max(7_000_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        const content = decodeAndValidateEvidenceAttachment(input);
        const stored = await storagePut(
          createEvidenceStorageKey(ctx.orgId, record.id, input.fileName),
          content,
          input.mimeType
        );
        try {
          await addCaseEvidence({
            orgId: ctx.orgId,
            transactionId: record.id,
            label: input.label,
            evidenceType: "attachment",
            url: stored.url,
            storageKey: stored.key,
            fileName: input.fileName,
            mimeType: input.mimeType,
            addedById: ctx.user!.openId,
            addedByName: ctx.user!.name ?? ctx.user!.email,
          });
        } catch (error) {
          await storageDelete(stored.key).catch(() => undefined);
          throw error;
        }
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.evidence_attachment_added",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Added an evidence attachment to ${record.reference}.`,
          metadata: {
            label: input.label,
            fileName: input.fileName,
            mimeType: input.mimeType,
          },
        });
        return { success: true };
      }),
    assignees: organizationProcedure.query(async ({ ctx }) => {
      const directory = await getWorkspaceDirectory(ctx.orgId);
      return directory.members.map(member => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        applicationRole: member.applicationRole,
      }));
    }),
    claimCase: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        if (record.caseStatus !== "under_review")
          throw new Error("Only active cases can be assigned.");
        if (record.assigneeId && record.assigneeId !== ctx.user!.openId)
          throw new Error(
            "This case is already assigned to another investigator."
          );
        const previousAssigneeId = record.assigneeId;
        record.assigneeId = ctx.user!.openId;
        record.assigneeName =
          ctx.user!.name ?? ctx.user!.email ?? "Assigned investigator";
        await persistTransaction(ctx.orgId, asInsertTransaction(record));
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.claimed",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Claimed case ${record.reference}.`,
          metadata: { previousAssigneeId, assigneeId: record.assigneeId },
        });
        return record;
      }),
    updateWorkflow: organizationManagerProcedure
      .input(caseWorkflowUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        if (record.caseStatus !== "under_review")
          throw new Error("Only active cases can be updated.");
        let assigneeName: string | null = null;
        if (input.assigneeId) {
          const directory = await getWorkspaceDirectory(ctx.orgId);
          const assignee = directory.members.find(
            member => member.userId === input.assigneeId
          );
          if (!assignee)
            throw new Error(
              "Select an active member of this organization as the assignee."
            );
          assigneeName =
            assignee.name ?? assignee.email ?? "Assigned investigator";
        }
        const previous = {
          assigneeId: record.assigneeId,
          casePriority: record.casePriority,
          dueAt: record.dueAt?.toISOString() ?? null,
        };
        applyCaseWorkflowUpdate(record, input, assigneeName);
        await persistTransaction(ctx.orgId, asInsertTransaction(record));
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "case.workflow_updated",
          actorId: ctx.user!.openId,
          actorName: ctx.user!.name ?? ctx.user!.email,
          subjectType: "case",
          subjectId: String(record.id),
          summary: `Updated assignment and service settings for ${record.reference}.`,
          metadata: {
            previous,
            assigneeId: record.assigneeId,
            casePriority: record.casePriority,
            dueAt: record.dueAt?.toISOString() ?? null,
          },
        });
        return record;
      }),
    workload: organizationManagerProcedure.query(({ ctx }) => {
      const activeCases = getRecords(ctx.orgId).filter(
        record => record.caseStatus === "under_review"
      );
      const now = Date.now();
      const byAssignee = new Map<
        string,
        {
          userId: string;
          name: string;
          open: number;
          critical: number;
          overdue: number;
        }
      >();
      for (const record of activeCases) {
        if (!record.assigneeId) continue;
        const current = byAssignee.get(record.assigneeId) ?? {
          userId: record.assigneeId,
          name: record.assigneeName ?? "Assigned investigator",
          open: 0,
          critical: 0,
          overdue: 0,
        };
        current.open += 1;
        if (record.casePriority === "critical") current.critical += 1;
        if (record.dueAt && record.dueAt.getTime() < now) current.overdue += 1;
        byAssignee.set(record.assigneeId, current);
      }
      const unassigned = activeCases.filter(record => !record.assigneeId);
      return {
        active: activeCases.length,
        unassigned: unassigned.length,
        overdue: activeCases.filter(
          record => record.dueAt && record.dueAt.getTime() < now
        ).length,
        byAssignee: Array.from(byAssignee.values()).sort(
          (first, second) =>
            second.open - first.open || first.name.localeCompare(second.name)
        ),
      };
    }),
    summarize: organizationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const record = getRecord(ctx.orgId, input.id);
        if (!record) throw new Error("Transaction not found");
        const summary = await createInvestigatorSummary({
          riskLevel: record.riskLevel,
          probability: record.probability,
          factors: record.factors,
          policySignals: record.policySignals,
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
    thresholdAnalysis: organizationManagerProcedure
      .input(z.object({ threshold: z.number().int().min(1).max(99) }))
      .query(async ({ ctx, input }) => {
        const feedback = await getOutcomeFeedbackByOrganization(ctx.orgId);
        return buildThresholdAnalysis(
          getRecords(ctx.orgId),
          feedback,
          input.threshold
        );
      }),
    drift: organizationManagerProcedure.query(() => driftDemo),
    persistenceStatus: organizationProcedure.query(async () => ({
      connected: Boolean(await getDb()),
    })),
  }),
});

export type AppRouter = typeof appRouter;
