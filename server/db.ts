import { and, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiKeys,
  apiRequestLogs,
  auditEvents,
  caseChecklistItems,
  caseEvidence,
  caseNotes,
  caseTags,
  InsertUser,
  InsertTransaction,
  notificationPreferences,
  organizationRoles,
  outcomeFeedback,
  savedQueueViews,
  apiIdempotencyKeys,
  riskEntities,
  riskPolicyVersions,
  retentionPolicyVersions,
  modelRegistryVersions,
  organizationControls,
  transactionEntityLinks,
  transactionImportBatches,
  transactions,
  users,
  weeklySummaryDeliveries,
  weeklySummaryPreferences,
} from "../drizzle/schema";
import type { ActualOutcome, OutcomeClassification } from "./outcomeFeedback";
import {
  DEFAULT_RISK_POLICY,
  normalizeRiskPolicy,
  RiskPolicyConfig,
} from "./riskPolicy";
import { ENV } from "./_core/env";
import { modelHealth } from "./modelData";

let database: ReturnType<typeof drizzle> | null = null;

export type AuditEventInput = {
  orgId: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  subjectType: string | null;
  subjectId: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventRecord = {
  id: number;
  orgId: string | null;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  subjectType: string | null;
  subjectId: string | null;
  summary: string;
  metadataJson: string;
  createdAt: Date;
};

export type CaseChecklistItemKey =
  | "identity_verification"
  | "device_review"
  | "merchant_review"
  | "activity_review"
  | "evidence_quality";

export type CaseChecklistItemRecord = {
  id: number;
  orgId: string;
  transactionId: number;
  itemKey: CaseChecklistItemKey;
  label: string;
  description: string;
  completed: boolean;
  note: string;
  completedById: string | null;
  completedByName: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const CASE_CHECKLIST_TEMPLATE: Array<{
  key: CaseChecklistItemKey;
  label: string;
  description: string;
}> = [
  {
    key: "identity_verification",
    label: "Verify identity and account context",
    description:
      "Confirm the customer and account context through approved sources.",
  },
  {
    key: "device_review",
    label: "Review device and access context",
    description:
      "Review device familiarity, access pattern, and relevant authentication context.",
  },
  {
    key: "merchant_review",
    label: "Review merchant and payment context",
    description:
      "Confirm the merchant, amount, and payment context before resolving the case.",
  },
  {
    key: "activity_review",
    label: "Review related activity",
    description:
      "Check linked activity and repeated patterns without treating association as proof.",
  },
  {
    key: "evidence_quality",
    label: "Confirm evidence quality and resolution reason",
    description:
      "Record sufficient evidence and a controlled resolution reason before closing.",
  },
];

export type CaseCommentInput = {
  orgId: string;
  transactionId: number;
  note: string;
  authorId: string | null;
  authorName: string;
};

export type CaseCommentRecord = CaseCommentInput & {
  id: number;
  createdAt: Date;
};
export type CaseTagRecord = {
  id: number;
  orgId: string | null;
  transactionId: number;
  tag: string;
  createdAt: Date;
};
export type CaseEvidenceInput = {
  orgId: string;
  transactionId: number;
  label: string;
  evidenceType: "link" | "attachment";
  url: string;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  addedById: string | null;
  addedByName: string | null;
};
export type CaseEvidenceRecord = CaseEvidenceInput & {
  id: number;
  createdAt: Date;
};

export type NotificationPreferencesInput = {
  emailEnabled: boolean;
  toEmail: string | null;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  teamsEnabled: boolean;
  teamsWebhookUrl: string | null;
  riskThreshold: number;
};

export type NotificationPreferencesRecord = NotificationPreferencesInput & {
  id: number;
  orgId: string;
  updatedAt: Date;
};

export type OutcomeFeedbackInput = {
  orgId: string;
  transactionId: number;
  predictedRiskLabel: "low" | "medium" | "high";
  predictedProbability: number;
  actualOutcome: ActualOutcome;
  classification: OutcomeClassification;
  resolutionReasonCode: string | null;
  recordedById: string | null;
  recordedByName: string | null;
};

export type OutcomeFeedbackRecord = OutcomeFeedbackInput & {
  id: number;
  recordedAt: Date;
};

export type ApiKeyScope = "transactions:write";
export type ApiKeyInput = {
  orgId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  createdById: string | null;
  createdByName: string | null;
  expiresAt: Date | null;
};
export type ApiKeyRecord = Omit<ApiKeyInput, "scopes"> & {
  id: number;
  scopesJson: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};
export type ApiRequestLogInput = {
  orgId: string;
  apiKeyId: number | null;
  requestId: string;
  endpoint: string;
  method: string;
  responseStatus: number;
  transactionReference?: string | null;
  riskLevel?: "low" | "medium" | "high" | null;
};
export type ApiRequestLogRecord = ApiRequestLogInput & {
  id: number;
  createdAt: Date;
};

export type SavedQueueViewInput = {
  orgId: string;
  ownerId: string;
  name: string;
  visibility: "private" | "shared";
  filters: Record<string, unknown>;
  createdByName: string | null;
};
export type SavedQueueViewRecord = Omit<SavedQueueViewInput, "filters"> & {
  id: number;
  filtersJson: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiIdempotencyInput = {
  orgId: string;
  apiKeyId: number;
  idempotencyKey: string;
  requestHash: string;
  expiresAt: Date;
};
export type ApiIdempotencyRecord = ApiIdempotencyInput & {
  id: number;
  status: "processing" | "completed";
  responseStatus: number | null;
  responseJson: string | null;
  transactionReference: string | null;
  createdAt: Date;
};

export type RiskEntityType =
  | "merchant_category"
  | "country_route"
  | "device_cohort";
export type DerivedRiskEntityInput = {
  entityType: RiskEntityType;
  entityKey: string;
  displayLabel: string;
  relationship: string;
};
export type RelatedActivityRecord = {
  entityType: RiskEntityType;
  displayLabel: string;
  relationship: string;
  relatedTransactions: Array<{
    id: number;
    reference: string;
    merchantName: string;
    riskLevel: "low" | "medium" | "high";
    caseStatus: "under_review" | "confirmed_fraud" | "legitimate";
    createdAt: Date;
  }>;
};

export type RiskPolicyStatus = "draft" | "active" | "retired";
export type RiskPolicyRecord = {
  id: number;
  orgId: string;
  version: number;
  status: RiskPolicyStatus;
  config: RiskPolicyConfig;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  createdAt: Date;
  approvedAt: Date | null;
};
export type RetentionPolicyStatus = "draft" | "active" | "retired";
export type RetentionPolicyRecord = {
  id: number;
  orgId: string;
  version: number;
  status: RetentionPolicyStatus;
  transactionRetentionDays: number;
  evidenceRetentionDays: number;
  auditRetentionDays: number;
  effectiveAt: Date;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  createdAt: Date;
  approvedAt: Date | null;
};
export type RetentionPolicyInput = Omit<
  RetentionPolicyRecord,
  | "id"
  | "version"
  | "status"
  | "approvedById"
  | "approvedByName"
  | "approvedAt"
  | "createdAt"
>;
export type ModelRegistryStatus = "champion" | "challenger" | "retired";
export type ModelEvaluation = {
  precisionMilli: number;
  recallMilli: number;
  f1Milli: number;
  prAucMilli: number;
  threshold: number;
  reviewed: number;
};
export type ModelRegistryRecord = {
  id: number;
  orgId: string;
  modelKey: string;
  version: string;
  status: ModelRegistryStatus;
  artifactHash: string;
  datasetLabel: string;
  evaluation: ModelEvaluation;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  createdAt: Date;
  approvedAt: Date | null;
};
export type OrganizationControlsRecord = {
  id: number;
  orgId: string;
  incidentMode: boolean;
  incidentNote: string | null;
  incidentActivatedById: string | null;
  incidentActivatedByName: string | null;
  incidentActivatedAt: Date | null;
  updatedAt: Date;
};

export type ImportBatchInput = {
  orgId: string;
  fileName: string;
  contentHash: string;
  totalRows: number;
  readyRows: number;
  invalidRows: number;
  duplicateRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  createdById: string | null;
  createdByName: string | null;
};
export type ImportBatchRecord = ImportBatchInput & {
  id: number;
  status: "previewed" | "completed" | "failed";
  importedRows: number;
  createdAt: Date;
  completedAt: Date | null;
};

export type WeeklySummaryPreferencesInput = {
  enabled: boolean;
  toEmail: string | null;
};

export type WeeklySummaryPreferencesRecord = WeeklySummaryPreferencesInput & {
  id: number;
  orgId: string;
  updatedAt: Date;
};

export type WeeklySummaryDeliveryInput = {
  orgId: string;
  periodStart: Date;
  recipient: string;
  resendEmailId?: string | null;
};

export type WeeklySummaryDeliveryRecord = WeeklySummaryDeliveryInput & {
  id: number;
  sentAt: Date;
};

export const DEFAULT_WEEKLY_SUMMARY_PREFERENCES: WeeklySummaryPreferencesInput =
  {
    enabled: false,
    toEmail: null,
  };

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesInput = {
  emailEnabled: false,
  toEmail: null,
  slackEnabled: false,
  slackWebhookUrl: null,
  teamsEnabled: false,
  teamsWebhookUrl: null,
  riskThreshold: 80,
};

const inMemoryAuditEvents = new Map<string, AuditEventRecord[]>();
const inMemoryComments = new Map<string, CaseCommentRecord[]>();
const inMemoryTags = new Map<string, CaseTagRecord[]>();
const inMemoryEvidence = new Map<string, CaseEvidenceRecord[]>();
const inMemoryNotificationPreferences = new Map<
  string,
  NotificationPreferencesRecord
>();
const inMemoryOutcomeFeedback = new Map<string, OutcomeFeedbackRecord>();
const inMemoryApiKeys = new Map<number, ApiKeyRecord>();
const inMemoryApiRequestLogs: ApiRequestLogRecord[] = [];
const inMemoryWeeklySummaryPreferences = new Map<
  string,
  WeeklySummaryPreferencesRecord
>();
const inMemoryWeeklySummaryDeliveries: WeeklySummaryDeliveryRecord[] = [];
const inMemorySavedQueueViews = new Map<string, SavedQueueViewRecord[]>();
const inMemoryApiIdempotency = new Map<string, ApiIdempotencyRecord>();
const inMemoryCaseChecklist = new Map<string, CaseChecklistItemRecord>();
const inMemoryRiskEntities = new Map<
  string,
  {
    id: number;
    orgId: string;
    entityType: RiskEntityType;
    entityKey: string;
    displayLabel: string;
  }
>();
const inMemoryImportBatches = new Map<string, ImportBatchRecord>();
const inMemoryRiskPolicies = new Map<string, RiskPolicyRecord[]>();
const inMemoryRetentionPolicies = new Map<string, RetentionPolicyRecord[]>();
const inMemoryModelRegistry = new Map<string, ModelRegistryRecord[]>();
const inMemoryOrganizationControls = new Map<
  string,
  OrganizationControlsRecord
>();
const inMemoryTransactionEntityLinks: Array<{
  orgId: string;
  transactionId: number;
  entityId: number;
  relationship: string;
}> = [];
let inMemoryCaseArtifactId = 1;
let inMemoryApiKeyId = 1;
let inMemoryApiRequestLogId = 1;
let inMemoryWeeklySummaryId = 1;
let inMemorySavedQueueViewId = 1;
let inMemoryApiIdempotencyId = 1;
let inMemoryRiskEntityId = 1;
let inMemoryImportBatchId = 1;
let inMemoryRiskPolicyId = 1;
let inMemoryRetentionPolicyId = 1;
let inMemoryModelRegistryId = 1;

function caseKey(orgId: string, transactionId: number) {
  return `${orgId}:${transactionId}`;
}

function checklistKey(
  orgId: string,
  transactionId: number,
  itemKey: CaseChecklistItemKey
) {
  return `${orgId}:${transactionId}:${itemKey}`;
}

function checklistRecord(
  orgId: string,
  transactionId: number,
  template: (typeof CASE_CHECKLIST_TEMPLATE)[number],
  existing?: Partial<
    Omit<CaseChecklistItemRecord, "itemKey" | "label" | "description">
  >
): CaseChecklistItemRecord {
  const epoch = new Date(0);
  return {
    id: existing?.id ?? 0,
    orgId,
    transactionId,
    itemKey: template.key,
    label: template.label,
    description: template.description,
    completed: existing?.completed ?? false,
    note: existing?.note ?? "",
    completedById: existing?.completedById ?? null,
    completedByName: existing?.completedByName ?? null,
    completedAt: existing?.completedAt ?? null,
    createdAt: existing?.createdAt ?? epoch,
    updatedAt: existing?.updatedAt ?? epoch,
  };
}

export async function getCaseChecklist(
  orgId: string,
  transactionId: number
): Promise<CaseChecklistItemRecord[]> {
  const db = await getDb();
  if (!db) {
    return CASE_CHECKLIST_TEMPLATE.map(template =>
      checklistRecord(
        orgId,
        transactionId,
        template,
        inMemoryCaseChecklist.get(
          checklistKey(orgId, transactionId, template.key)
        )
      )
    );
  }
  const rows = await db
    .select()
    .from(caseChecklistItems)
    .where(
      and(
        eq(caseChecklistItems.orgId, orgId),
        eq(caseChecklistItems.transactionId, transactionId)
      )
    );
  const byKey = new Map(rows.map(row => [row.itemKey, row]));
  return CASE_CHECKLIST_TEMPLATE.map(template =>
    checklistRecord(orgId, transactionId, template, byKey.get(template.key))
  );
}

export async function updateCaseChecklistItem(input: {
  orgId: string;
  transactionId: number;
  itemKey: CaseChecklistItemKey;
  completed: boolean;
  note: string;
  completedById: string | null;
  completedByName: string | null;
}): Promise<CaseChecklistItemRecord> {
  const template = CASE_CHECKLIST_TEMPLATE.find(
    item => item.key === input.itemKey
  );
  if (!template) throw new Error("Unknown case checklist item.");
  const now = new Date();
  const completedAt = input.completed ? now : null;
  const db = await getDb();
  if (!db) {
    const key = checklistKey(input.orgId, input.transactionId, input.itemKey);
    const existing = inMemoryCaseChecklist.get(key);
    const saved = checklistRecord(input.orgId, input.transactionId, template, {
      id: existing?.id ?? inMemoryCaseArtifactId++,
      completed: input.completed,
      note: input.note,
      completedById: input.completedById,
      completedByName: input.completedByName,
      completedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    inMemoryCaseChecklist.set(key, saved);
    return saved;
  }
  await db
    .insert(caseChecklistItems)
    .values({
      orgId: input.orgId,
      transactionId: input.transactionId,
      itemKey: input.itemKey,
      completed: input.completed,
      note: input.note,
      completedById: input.completedById,
      completedByName: input.completedByName,
      completedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        completed: input.completed,
        note: input.note,
        completedById: input.completedById,
        completedByName: input.completedByName,
        completedAt,
        updatedAt: now,
      },
    });
  const rows = await db
    .select()
    .from(caseChecklistItems)
    .where(
      and(
        eq(caseChecklistItems.orgId, input.orgId),
        eq(caseChecklistItems.transactionId, input.transactionId),
        eq(caseChecklistItems.itemKey, input.itemKey)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Case checklist item could not be saved.");
  return checklistRecord(input.orgId, input.transactionId, template, rows[0]);
}

function defaultRiskPolicyRecord(orgId: string): RiskPolicyRecord {
  return {
    id: 0,
    orgId,
    version: 1,
    status: "active",
    config: DEFAULT_RISK_POLICY,
    changeNote: "Built-in demonstration policy.",
    createdById: null,
    createdByName: "FraudLens",
    approvedById: null,
    approvedByName: null,
    createdAt: new Date(0),
    approvedAt: new Date(0),
  };
}

function mapRiskPolicyRow(
  row: typeof riskPolicyVersions.$inferSelect
): RiskPolicyRecord {
  let config: unknown;
  try {
    config = JSON.parse(row.configJson);
  } catch {
    config = DEFAULT_RISK_POLICY;
  }
  return {
    id: row.id,
    orgId: row.orgId,
    version: row.version,
    status: row.status,
    config: normalizeRiskPolicy(config),
    changeNote: row.changeNote,
    createdById: row.createdById,
    createdByName: row.createdByName,
    approvedById: row.approvedById,
    approvedByName: row.approvedByName,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}

export async function getRiskPoliciesByOrganization(
  orgId: string
): Promise<RiskPolicyRecord[]> {
  const db = await getDb();
  if (!db) {
    return [
      ...(inMemoryRiskPolicies.get(orgId) ?? [defaultRiskPolicyRecord(orgId)]),
    ].sort((first, second) => second.version - first.version);
  }
  const rows = await db
    .select()
    .from(riskPolicyVersions)
    .where(eq(riskPolicyVersions.orgId, orgId))
    .orderBy(desc(riskPolicyVersions.version));
  return rows.length
    ? rows.map(mapRiskPolicyRow)
    : [defaultRiskPolicyRecord(orgId)];
}

export async function getActiveRiskPolicy(
  orgId: string
): Promise<RiskPolicyRecord> {
  const policies = await getRiskPoliciesByOrganization(orgId);
  return (
    policies.find(policy => policy.status === "active") ??
    defaultRiskPolicyRecord(orgId)
  );
}

export async function createRiskPolicyDraft(input: {
  orgId: string;
  config: RiskPolicyConfig;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
}): Promise<RiskPolicyRecord> {
  const policies = await getRiskPoliciesByOrganization(input.orgId);
  const version = Math.max(...policies.map(policy => policy.version), 1) + 1;
  const db = await getDb();
  if (!db) {
    const record: RiskPolicyRecord = {
      id: inMemoryRiskPolicyId++,
      orgId: input.orgId,
      version,
      status: "draft",
      config: normalizeRiskPolicy(input.config),
      changeNote: input.changeNote,
      createdById: input.createdById,
      createdByName: input.createdByName,
      approvedById: null,
      approvedByName: null,
      createdAt: new Date(),
      approvedAt: null,
    };
    const existing = inMemoryRiskPolicies.get(input.orgId) ?? [
      defaultRiskPolicyRecord(input.orgId),
    ];
    inMemoryRiskPolicies.set(input.orgId, [record, ...existing]);
    return record;
  }
  await db.insert(riskPolicyVersions).values({
    orgId: input.orgId,
    version,
    status: "draft",
    configJson: JSON.stringify(normalizeRiskPolicy(input.config)),
    changeNote: input.changeNote,
    createdById: input.createdById,
    createdByName: input.createdByName,
  });
  const rows = await db
    .select()
    .from(riskPolicyVersions)
    .where(
      and(
        eq(riskPolicyVersions.orgId, input.orgId),
        eq(riskPolicyVersions.version, version)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Policy draft could not be created.");
  return mapRiskPolicyRow(rows[0]);
}

export async function activateRiskPolicy(
  orgId: string,
  policyId: number,
  approvedById: string,
  approvedByName: string | null
): Promise<RiskPolicyRecord> {
  const db = await getDb();
  const approvedAt = new Date();
  if (!db) {
    const policies = inMemoryRiskPolicies.get(orgId) ?? [
      defaultRiskPolicyRecord(orgId),
    ];
    const target = policies.find(policy => policy.id === policyId);
    if (!target || target.status === "active")
      throw new Error("Policy version is not eligible for activation.");
    const updated = policies.map(policy =>
      policy.id === policyId
        ? {
            ...policy,
            status: "active" as const,
            approvedById,
            approvedByName,
            approvedAt,
          }
        : policy.status === "active"
          ? { ...policy, status: "retired" as const }
          : policy
    );
    inMemoryRiskPolicies.set(orgId, updated);
    return updated.find(policy => policy.id === policyId)!;
  }
  const rows = await db
    .select()
    .from(riskPolicyVersions)
    .where(
      and(
        eq(riskPolicyVersions.orgId, orgId),
        eq(riskPolicyVersions.id, policyId)
      )
    )
    .limit(1);
  if (!rows[0] || rows[0].status === "active")
    throw new Error("Policy version is not eligible for activation.");
  await db
    .update(riskPolicyVersions)
    .set({ status: "retired" })
    .where(
      and(
        eq(riskPolicyVersions.orgId, orgId),
        eq(riskPolicyVersions.status, "active")
      )
    );
  await db
    .update(riskPolicyVersions)
    .set({ status: "active", approvedById, approvedByName, approvedAt })
    .where(
      and(
        eq(riskPolicyVersions.orgId, orgId),
        eq(riskPolicyVersions.id, policyId)
      )
    );
  const updated = await db
    .select()
    .from(riskPolicyVersions)
    .where(
      and(
        eq(riskPolicyVersions.orgId, orgId),
        eq(riskPolicyVersions.id, policyId)
      )
    )
    .limit(1);
  if (!updated[0]) throw new Error("Policy activation could not be confirmed.");
  return mapRiskPolicyRow(updated[0]);
}

const DEFAULT_RETENTION_POLICY = {
  transactionRetentionDays: 365,
  evidenceRetentionDays: 365,
  auditRetentionDays: 730,
};
function defaultRetentionPolicyRecord(orgId: string): RetentionPolicyRecord {
  return {
    id: 0,
    orgId,
    version: 1,
    status: "active",
    ...DEFAULT_RETENTION_POLICY,
    effectiveAt: new Date(0),
    changeNote: "Built-in demonstration retention policy.",
    createdById: null,
    createdByName: "FraudLens",
    approvedById: null,
    approvedByName: null,
    createdAt: new Date(0),
    approvedAt: new Date(0),
  };
}
function mapRetentionPolicyRow(
  row: typeof retentionPolicyVersions.$inferSelect
): RetentionPolicyRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    version: row.version,
    status: row.status,
    transactionRetentionDays: row.transactionRetentionDays,
    evidenceRetentionDays: row.evidenceRetentionDays,
    auditRetentionDays: row.auditRetentionDays,
    effectiveAt: row.effectiveAt,
    changeNote: row.changeNote,
    createdById: row.createdById,
    createdByName: row.createdByName,
    approvedById: row.approvedById,
    approvedByName: row.approvedByName,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}
export async function getRetentionPoliciesByOrganization(
  orgId: string
): Promise<RetentionPolicyRecord[]> {
  const db = await getDb();
  if (!db) {
    return [
      ...(inMemoryRetentionPolicies.get(orgId) ?? [
        defaultRetentionPolicyRecord(orgId),
      ]),
    ].sort((first, second) => second.version - first.version);
  }
  const rows = await db
    .select()
    .from(retentionPolicyVersions)
    .where(eq(retentionPolicyVersions.orgId, orgId))
    .orderBy(desc(retentionPolicyVersions.version));
  return rows.length
    ? rows.map(mapRetentionPolicyRow)
    : [defaultRetentionPolicyRecord(orgId)];
}
export async function getActiveRetentionPolicy(
  orgId: string
): Promise<RetentionPolicyRecord> {
  const policies = await getRetentionPoliciesByOrganization(orgId);
  return (
    policies.find(policy => policy.status === "active") ??
    defaultRetentionPolicyRecord(orgId)
  );
}
export async function createRetentionPolicyDraft(input: {
  orgId: string;
  transactionRetentionDays: number;
  evidenceRetentionDays: number;
  auditRetentionDays: number;
  effectiveAt: Date;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
}): Promise<RetentionPolicyRecord> {
  const policies = await getRetentionPoliciesByOrganization(input.orgId);
  const version = Math.max(...policies.map(policy => policy.version), 1) + 1;
  const db = await getDb();
  if (!db) {
    const record: RetentionPolicyRecord = {
      id: inMemoryRetentionPolicyId++,
      orgId: input.orgId,
      version,
      status: "draft",
      transactionRetentionDays: input.transactionRetentionDays,
      evidenceRetentionDays: input.evidenceRetentionDays,
      auditRetentionDays: input.auditRetentionDays,
      effectiveAt: input.effectiveAt,
      changeNote: input.changeNote,
      createdById: input.createdById,
      createdByName: input.createdByName,
      approvedById: null,
      approvedByName: null,
      createdAt: new Date(),
      approvedAt: null,
    };
    const existing = inMemoryRetentionPolicies.get(input.orgId) ?? [
      defaultRetentionPolicyRecord(input.orgId),
    ];
    inMemoryRetentionPolicies.set(input.orgId, [record, ...existing]);
    return record;
  }
  await db.insert(retentionPolicyVersions).values({
    orgId: input.orgId,
    version,
    status: "draft",
    transactionRetentionDays: input.transactionRetentionDays,
    evidenceRetentionDays: input.evidenceRetentionDays,
    auditRetentionDays: input.auditRetentionDays,
    effectiveAt: input.effectiveAt,
    changeNote: input.changeNote,
    createdById: input.createdById,
    createdByName: input.createdByName,
  });
  const rows = await db
    .select()
    .from(retentionPolicyVersions)
    .where(
      and(
        eq(retentionPolicyVersions.orgId, input.orgId),
        eq(retentionPolicyVersions.version, version)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Retention policy draft could not be created.");
  return mapRetentionPolicyRow(rows[0]);
}
export async function activateRetentionPolicy(
  orgId: string,
  policyId: number,
  approvedById: string,
  approvedByName: string | null
): Promise<RetentionPolicyRecord> {
  const db = await getDb();
  const approvedAt = new Date();
  if (!db) {
    const policies = inMemoryRetentionPolicies.get(orgId) ?? [
      defaultRetentionPolicyRecord(orgId),
    ];
    const target = policies.find(policy => policy.id === policyId);
    if (!target || target.status === "active")
      throw new Error("Retention policy is not eligible for activation.");
    const updated = policies.map(policy =>
      policy.id === policyId
        ? {
            ...policy,
            status: "active" as const,
            approvedById,
            approvedByName,
            approvedAt,
          }
        : policy.status === "active"
          ? { ...policy, status: "retired" as const }
          : policy
    );
    inMemoryRetentionPolicies.set(orgId, updated);
    return updated.find(policy => policy.id === policyId)!;
  }
  const rows = await db
    .select()
    .from(retentionPolicyVersions)
    .where(
      and(
        eq(retentionPolicyVersions.orgId, orgId),
        eq(retentionPolicyVersions.id, policyId)
      )
    )
    .limit(1);
  if (!rows[0] || rows[0].status === "active")
    throw new Error("Retention policy is not eligible for activation.");
  await db
    .update(retentionPolicyVersions)
    .set({ status: "retired" })
    .where(
      and(
        eq(retentionPolicyVersions.orgId, orgId),
        eq(retentionPolicyVersions.status, "active")
      )
    );
  await db
    .update(retentionPolicyVersions)
    .set({ status: "active", approvedById, approvedByName, approvedAt })
    .where(
      and(
        eq(retentionPolicyVersions.orgId, orgId),
        eq(retentionPolicyVersions.id, policyId)
      )
    );
  const updated = await db
    .select()
    .from(retentionPolicyVersions)
    .where(
      and(
        eq(retentionPolicyVersions.orgId, orgId),
        eq(retentionPolicyVersions.id, policyId)
      )
    )
    .limit(1);
  if (!updated[0])
    throw new Error("Retention policy activation could not be confirmed.");
  return mapRetentionPolicyRow(updated[0]);
}
function defaultOrganizationControls(
  orgId: string
): OrganizationControlsRecord {
  return {
    id: 0,
    orgId,
    incidentMode: false,
    incidentNote: null,
    incidentActivatedById: null,
    incidentActivatedByName: null,
    incidentActivatedAt: null,
    updatedAt: new Date(0),
  };
}
export async function getOrganizationControls(
  orgId: string
): Promise<OrganizationControlsRecord> {
  const db = await getDb();
  if (!db) {
    return (
      inMemoryOrganizationControls.get(orgId) ??
      defaultOrganizationControls(orgId)
    );
  }
  const rows = await db
    .select()
    .from(organizationControls)
    .where(eq(organizationControls.orgId, orgId))
    .limit(1);
  return rows[0] ?? defaultOrganizationControls(orgId);
}
export async function setIncidentMode(input: {
  orgId: string;
  enabled: boolean;
  note: string | null;
  actorId: string;
  actorName: string | null;
}): Promise<OrganizationControlsRecord> {
  const now = new Date();
  const record: OrganizationControlsRecord = {
    id: 0,
    orgId: input.orgId,
    incidentMode: input.enabled,
    incidentNote: input.enabled ? input.note : null,
    incidentActivatedById: input.enabled ? input.actorId : null,
    incidentActivatedByName: input.enabled ? input.actorName : null,
    incidentActivatedAt: input.enabled ? now : null,
    updatedAt: now,
  };
  const db = await getDb();
  if (!db) {
    const existing = inMemoryOrganizationControls.get(input.orgId);
    inMemoryOrganizationControls.set(input.orgId, {
      ...record,
      id: existing?.id ?? 0,
    });
    return inMemoryOrganizationControls.get(input.orgId)!;
  }
  await db
    .insert(organizationControls)
    .values({
      orgId: input.orgId,
      incidentMode: input.enabled,
      incidentNote: input.enabled ? input.note : null,
      incidentActivatedById: input.enabled ? input.actorId : null,
      incidentActivatedByName: input.enabled ? input.actorName : null,
      incidentActivatedAt: input.enabled ? now : null,
    })
    .onDuplicateKeyUpdate({
      set: {
        incidentMode: input.enabled,
        incidentNote: input.enabled ? input.note : null,
        incidentActivatedById: input.enabled ? input.actorId : null,
        incidentActivatedByName: input.enabled ? input.actorName : null,
        incidentActivatedAt: input.enabled ? now : null,
        updatedAt: now,
      },
    });
  const rows = await db
    .select()
    .from(organizationControls)
    .where(eq(organizationControls.orgId, input.orgId))
    .limit(1);
  if (!rows[0]) throw new Error("Organization controls could not be saved.");
  return rows[0];
}
export async function isIncidentModeEnabled(orgId: string) {
  return (await getOrganizationControls(orgId)).incidentMode;
}
function defaultModelRegistryRecord(orgId: string): ModelRegistryRecord {
  return {
    id: 0,
    orgId,
    modelKey: "fraudlens-demonstration",
    version: modelHealth.modelVersion,
    status: "champion",
    artifactHash: `demo-${modelHealth.modelVersion}`,
    datasetLabel: modelHealth.datasetLabel,
    evaluation: {
      precisionMilli: Math.round(modelHealth.precision * 1000),
      recallMilli: Math.round(modelHealth.recall * 1000),
      f1Milli: Math.round(modelHealth.f1Score * 1000),
      prAucMilli: Math.round(modelHealth.prAuc * 1000),
      threshold: modelHealth.threshold,
      reviewed: modelHealth.sampleRows,
    },
    changeNote:
      "Built-in demonstration model; does not control manual scoring.",
    createdById: null,
    createdByName: "FraudLens",
    approvedById: null,
    approvedByName: null,
    createdAt: modelHealth.evaluatedAt,
    approvedAt: modelHealth.evaluatedAt,
  };
}
function mapModelRegistryRow(
  row: typeof modelRegistryVersions.$inferSelect
): ModelRegistryRecord {
  let evaluation: ModelEvaluation;
  try {
    evaluation = JSON.parse(row.evaluationJson) as ModelEvaluation;
  } catch {
    evaluation = {
      precisionMilli: 0,
      recallMilli: 0,
      f1Milli: 0,
      prAucMilli: 0,
      threshold: 0,
      reviewed: 0,
    };
  }
  return {
    id: row.id,
    orgId: row.orgId,
    modelKey: row.modelKey,
    version: row.version,
    status: row.status,
    artifactHash: row.artifactHash,
    datasetLabel: row.datasetLabel,
    evaluation,
    changeNote: row.changeNote,
    createdById: row.createdById,
    createdByName: row.createdByName,
    approvedById: row.approvedById,
    approvedByName: row.approvedByName,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
  };
}
export async function getModelRegistryByOrganization(
  orgId: string
): Promise<ModelRegistryRecord[]> {
  const db = await getDb();
  if (!db) {
    return [
      ...(inMemoryModelRegistry.get(orgId) ?? [
        defaultModelRegistryRecord(orgId),
      ]),
    ].sort(
      (first, second) => second.createdAt.getTime() - first.createdAt.getTime()
    );
  }
  const rows = await db
    .select()
    .from(modelRegistryVersions)
    .where(eq(modelRegistryVersions.orgId, orgId))
    .orderBy(desc(modelRegistryVersions.createdAt));
  return rows.length
    ? rows.map(mapModelRegistryRow)
    : [defaultModelRegistryRecord(orgId)];
}
export async function getChampionModel(
  orgId: string
): Promise<ModelRegistryRecord> {
  const registry = await getModelRegistryByOrganization(orgId);
  return (
    registry.find(model => model.status === "champion") ??
    defaultModelRegistryRecord(orgId)
  );
}
export async function createModelRegistryCandidate(input: {
  orgId: string;
  modelKey: string;
  version: string;
  artifactHash: string;
  datasetLabel: string;
  evaluation: ModelEvaluation;
  changeNote: string;
  createdById: string | null;
  createdByName: string | null;
}): Promise<ModelRegistryRecord> {
  const registry = await getModelRegistryByOrganization(input.orgId);
  const db = await getDb();
  if (!db) {
    const record: ModelRegistryRecord = {
      id: inMemoryModelRegistryId++,
      ...input,
      status: "challenger",
      approvedById: null,
      approvedByName: null,
      createdAt: new Date(),
      approvedAt: null,
    };
    inMemoryModelRegistry.set(input.orgId, [
      record,
      ...(inMemoryModelRegistry.get(input.orgId) ?? [
        defaultModelRegistryRecord(input.orgId),
      ]),
    ]);
    return record;
  }
  await db.insert(modelRegistryVersions).values({
    orgId: input.orgId,
    modelKey: input.modelKey,
    version: input.version,
    status: "challenger",
    artifactHash: input.artifactHash,
    datasetLabel: input.datasetLabel,
    evaluationJson: JSON.stringify(input.evaluation),
    changeNote: input.changeNote,
    createdById: input.createdById,
    createdByName: input.createdByName,
  });
  const rows = await db
    .select()
    .from(modelRegistryVersions)
    .where(
      and(
        eq(modelRegistryVersions.orgId, input.orgId),
        eq(modelRegistryVersions.modelKey, input.modelKey),
        eq(modelRegistryVersions.version, input.version)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Model candidate could not be created.");
  return mapModelRegistryRow(rows[0]);
}
export async function approveModelCandidate(
  orgId: string,
  modelId: number,
  approvedById: string,
  approvedByName: string | null
): Promise<ModelRegistryRecord> {
  const db = await getDb();
  const approvedAt = new Date();
  if (!db) {
    const registry = inMemoryModelRegistry.get(orgId) ?? [
      defaultModelRegistryRecord(orgId),
    ];
    const target = registry.find(model => model.id === modelId);
    if (!target || target.status !== "challenger")
      throw new Error("Only challenger models can be approved.");
    const updated = registry.map(model =>
      model.id === modelId
        ? {
            ...model,
            status: "champion" as const,
            approvedById,
            approvedByName,
            approvedAt,
          }
        : model.status === "champion"
          ? { ...model, status: "retired" as const }
          : model
    );
    inMemoryModelRegistry.set(orgId, updated);
    return updated.find(model => model.id === modelId)!;
  }
  const rows = await db
    .select()
    .from(modelRegistryVersions)
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId)
      )
    )
    .limit(1);
  if (!rows[0] || rows[0].status !== "challenger")
    throw new Error("Only challenger models can be approved.");
  await db
    .update(modelRegistryVersions)
    .set({ status: "retired" })
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.status, "champion")
      )
    );
  await db
    .update(modelRegistryVersions)
    .set({ status: "champion", approvedById, approvedByName, approvedAt })
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId)
      )
    );
  const updated = await db
    .select()
    .from(modelRegistryVersions)
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId)
      )
    )
    .limit(1);
  if (!updated[0]) throw new Error("Model approval could not be confirmed.");
  return mapModelRegistryRow(updated[0]);
}
export async function rollbackModelChampion(
  orgId: string,
  modelId: number,
  approvedById: string,
  approvedByName: string | null
): Promise<ModelRegistryRecord> {
  const db = await getDb();
  if (!db) {
    const registry = inMemoryModelRegistry.get(orgId) ?? [
      defaultModelRegistryRecord(orgId),
    ];
    const target = registry.find(model => model.id === modelId);
    if (!target || target.status !== "retired")
      throw new Error("Only retired models can be restored.");
    const updated = registry.map(model =>
      model.id === modelId
        ? {
            ...model,
            status: "champion" as const,
            approvedById,
            approvedByName,
            approvedAt: new Date(),
          }
        : model.status === "champion"
          ? { ...model, status: "retired" as const }
          : model
    );
    inMemoryModelRegistry.set(orgId, updated);
    return updated.find(model => model.id === modelId)!;
  }
  const rows = await db
    .select()
    .from(modelRegistryVersions)
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId),
        eq(modelRegistryVersions.status, "retired")
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Only retired models can be restored.");
  await db
    .update(modelRegistryVersions)
    .set({ status: "retired" })
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.status, "champion")
      )
    );
  await db
    .update(modelRegistryVersions)
    .set({
      status: "champion",
      approvedById,
      approvedByName,
      approvedAt: new Date(),
    })
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId)
      )
    );
  const updated = await db
    .select()
    .from(modelRegistryVersions)
    .where(
      and(
        eq(modelRegistryVersions.orgId, orgId),
        eq(modelRegistryVersions.id, modelId)
      )
    )
    .limit(1);
  if (!updated[0]) throw new Error("Model rollback could not be confirmed.");
  return mapModelRegistryRow(updated[0]);
}
export async function getDb() {
  if (!process.env.DATABASE_URL) {
    if (ENV.isProduction) {
      throw new Error("A database connection is required in production.");
    }
    return null;
  }
  if (!database) database = drizzle(process.env.DATABASE_URL);
  return database;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    ...user,
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  if (user.openId === ENV.ownerOpenId) values.role = "admin";
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        name: values.name,
        email: values.email,
        loginMethod: values.loginMethod,
        lastSignedIn: new Date(),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export type FraudLensApplicationRole = "analyst" | "manager" | "admin";

/**
 * Returns the application role for one user in one organization. A missing
 * mapping is initialized from the immutable bootstrap configuration; existing
 * global users.role values are deliberately not used for authorization.
 */
export async function getOrCreateOrganizationRole(
  orgId: string,
  openId: string,
  bootstrapRole: FraudLensApplicationRole
): Promise<FraudLensApplicationRole> {
  const db = await getDb();
  if (!db) return bootstrapRole;

  const rows = await db
    .select({ role: organizationRoles.role })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.orgId, orgId),
        eq(organizationRoles.openId, openId)
      )
    )
    .limit(1);
  if (rows[0]) return rows[0].role;

  await db
    .insert(organizationRoles)
    .values({ orgId, openId, role: bootstrapRole })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  return bootstrapRole;
}

export async function getOrganizationRolesByUsers(
  orgId: string,
  openIds: string[]
): Promise<Map<string, FraudLensApplicationRole>> {
  const db = await getDb();
  if (!db || openIds.length === 0) return new Map();
  const rows = await db
    .select({ openId: organizationRoles.openId, role: organizationRoles.role })
    .from(organizationRoles)
    .where(
      and(
        eq(organizationRoles.orgId, orgId),
        inArray(organizationRoles.openId, openIds)
      )
    );
  return new Map(rows.map(row => [row.openId, row.role]));
}

export async function setOrganizationRole(
  orgId: string,
  openId: string,
  role: FraudLensApplicationRole
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "A database connection is required to update FraudLens roles."
    );
  }
  await db
    .insert(organizationRoles)
    .values({ orgId, openId, role })
    .onDuplicateKeyUpdate({ set: { role, updatedAt: new Date() } });
}

export async function getTransactionsByOrganization(orgId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.orgId, orgId))
    .orderBy(desc(transactions.createdAt));
}

export async function createImportBatch(
  input: ImportBatchInput
): Promise<ImportBatchRecord> {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const record: ImportBatchRecord = {
      ...input,
      id: inMemoryImportBatchId++,
      status: "previewed",
      importedRows: 0,
      createdAt: now,
      completedAt: null,
    };
    inMemoryImportBatches.set(`${input.orgId}:${record.id}`, record);
    return record;
  }
  await db.insert(transactionImportBatches).values({
    orgId: input.orgId,
    fileName: input.fileName,
    contentHash: input.contentHash,
    totalRows: input.totalRows,
    readyRows: input.readyRows,
    invalidRows: input.invalidRows,
    duplicateRows: input.duplicateRows,
    errorsJson: JSON.stringify(input.errors.slice(0, 100)),
    createdById: input.createdById,
    createdByName: input.createdByName,
  });
  const rows = await db
    .select()
    .from(transactionImportBatches)
    .where(
      and(
        eq(transactionImportBatches.orgId, input.orgId),
        eq(transactionImportBatches.fileName, input.fileName),
        eq(transactionImportBatches.contentHash, input.contentHash)
      )
    )
    .orderBy(desc(transactionImportBatches.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Import batch could not be created.");
  return {
    ...input,
    id: row.id,
    status: row.status,
    importedRows: row.importedRows,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export async function getImportBatch(
  orgId: string,
  id: number
): Promise<ImportBatchRecord | null> {
  const db = await getDb();
  if (!db) return inMemoryImportBatches.get(`${orgId}:${id}`) ?? null;
  const rows = await db
    .select()
    .from(transactionImportBatches)
    .where(
      and(
        eq(transactionImportBatches.orgId, orgId),
        eq(transactionImportBatches.id, id)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  let errors: ImportBatchRecord["errors"] = [];
  try {
    const parsed = JSON.parse(row.errorsJson) as unknown;
    if (Array.isArray(parsed)) errors = parsed as ImportBatchRecord["errors"];
  } catch {
    /* Preserve the batch even if old metadata is malformed. */
  }
  return {
    orgId: row.orgId,
    fileName: row.fileName,
    contentHash: row.contentHash,
    totalRows: row.totalRows,
    readyRows: row.readyRows,
    invalidRows: row.invalidRows,
    duplicateRows: row.duplicateRows,
    errors,
    createdById: row.createdById,
    createdByName: row.createdByName,
    id: row.id,
    status: row.status,
    importedRows: row.importedRows,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export async function getImportBatchesByOrganization(
  orgId: string
): Promise<ImportBatchRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryImportBatches.values())
      .filter(batch => batch.orgId === orgId)
      .sort(
        (first, second) =>
          second.createdAt.getTime() - first.createdAt.getTime()
      )
      .slice(0, 20);
  }
  const rows = await db
    .select()
    .from(transactionImportBatches)
    .where(eq(transactionImportBatches.orgId, orgId))
    .orderBy(desc(transactionImportBatches.createdAt))
    .limit(20);
  return rows.map(row => {
    let errors: ImportBatchRecord["errors"] = [];
    try {
      const parsed = JSON.parse(row.errorsJson) as unknown;
      if (Array.isArray(parsed)) errors = parsed as ImportBatchRecord["errors"];
    } catch {
      /* Preserve the batch even if old metadata is malformed. */
    }
    return {
      orgId: row.orgId,
      fileName: row.fileName,
      contentHash: row.contentHash,
      totalRows: row.totalRows,
      readyRows: row.readyRows,
      invalidRows: row.invalidRows,
      duplicateRows: row.duplicateRows,
      errors,
      createdById: row.createdById,
      createdByName: row.createdByName,
      id: row.id,
      status: row.status,
      importedRows: row.importedRows,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  });
}

export async function completeImportBatch(
  orgId: string,
  id: number,
  update: Pick<ImportBatchRecord, "status" | "importedRows">
): Promise<void> {
  const db = await getDb();
  const completedAt = new Date();
  const current = inMemoryImportBatches.get(`${orgId}:${id}`);
  if (current) {
    inMemoryImportBatches.set(`${orgId}:${id}`, {
      ...current,
      ...update,
      completedAt,
    });
  }
  if (!db) return;
  await db
    .update(transactionImportBatches)
    .set({ ...update, completedAt })
    .where(
      and(
        eq(transactionImportBatches.orgId, orgId),
        eq(transactionImportBatches.id, id)
      )
    );
}

export async function upsertTransactionEntities(
  orgId: string,
  transactionId: number,
  entities: DerivedRiskEntityInput[]
): Promise<void> {
  const db = await getDb();
  if (!db) {
    for (const entity of entities) {
      const key = `${orgId}:${entity.entityType}:${entity.entityKey}`;
      const existing = inMemoryRiskEntities.get(key);
      const stored = existing ?? {
        id: inMemoryRiskEntityId++,
        orgId,
        entityType: entity.entityType,
        entityKey: entity.entityKey,
        displayLabel: entity.displayLabel,
      };
      stored.displayLabel = entity.displayLabel;
      inMemoryRiskEntities.set(key, stored);
      if (
        !inMemoryTransactionEntityLinks.some(
          link =>
            link.orgId === orgId &&
            link.transactionId === transactionId &&
            link.entityId === stored.id
        )
      ) {
        inMemoryTransactionEntityLinks.push({
          orgId,
          transactionId,
          entityId: stored.id,
          relationship: entity.relationship,
        });
      }
    }
    return;
  }
  for (const entity of entities) {
    await db
      .insert(riskEntities)
      .values({
        orgId,
        entityType: entity.entityType,
        entityKey: entity.entityKey,
        displayLabel: entity.displayLabel,
      })
      .onDuplicateKeyUpdate({ set: { displayLabel: entity.displayLabel } });
    const rows = await db
      .select({ id: riskEntities.id })
      .from(riskEntities)
      .where(
        and(
          eq(riskEntities.orgId, orgId),
          eq(riskEntities.entityType, entity.entityType),
          eq(riskEntities.entityKey, entity.entityKey)
        )
      )
      .limit(1);
    const entityId = rows[0]?.id;
    if (!entityId) throw new Error("Risk entity could not be persisted.");
    await db
      .insert(transactionEntityLinks)
      .values({
        orgId,
        transactionId,
        entityId,
        relationship: entity.relationship,
      })
      .onDuplicateKeyUpdate({ set: { relationship: entity.relationship } });
  }
}

export async function getStoredRelatedActivity(
  orgId: string,
  transactionId: number
): Promise<RelatedActivityRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const links = await db
    .select({
      entityId: transactionEntityLinks.entityId,
      entityType: riskEntities.entityType,
      displayLabel: riskEntities.displayLabel,
      relationship: transactionEntityLinks.relationship,
    })
    .from(transactionEntityLinks)
    .innerJoin(
      riskEntities,
      and(
        eq(transactionEntityLinks.entityId, riskEntities.id),
        eq(transactionEntityLinks.orgId, riskEntities.orgId)
      )
    )
    .where(
      and(
        eq(transactionEntityLinks.orgId, orgId),
        eq(transactionEntityLinks.transactionId, transactionId)
      )
    );
  return Promise.all(
    links.map(async link => {
      const relatedTransactions = await db
        .select({
          id: transactions.id,
          reference: transactions.reference,
          merchantName: transactions.merchantCategory,
          riskLevel: transactions.riskLabel,
          caseStatus: transactions.caseStatus,
          createdAt: transactions.createdAt,
        })
        .from(transactionEntityLinks)
        .innerJoin(
          transactions,
          and(
            eq(transactionEntityLinks.transactionId, transactions.id),
            eq(transactionEntityLinks.orgId, transactions.orgId)
          )
        )
        .where(
          and(
            eq(transactionEntityLinks.orgId, orgId),
            eq(transactionEntityLinks.entityId, link.entityId),
            ne(transactionEntityLinks.transactionId, transactionId)
          )
        )
        .orderBy(desc(transactions.createdAt))
        .limit(6);
      return {
        entityType: link.entityType,
        displayLabel: link.displayLabel,
        relationship: link.relationship,
        relatedTransactions,
      };
    })
  );
}

export async function getTransactionReferencesByOrganization(
  orgId: string
): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ reference: transactions.reference })
    .from(transactions)
    .where(eq(transactions.orgId, orgId));
  return new Set(rows.map(row => row.reference.trim().toUpperCase()));
}

export async function getNotificationPreferences(
  orgId: string
): Promise<NotificationPreferencesRecord> {
  const db = await getDb();
  if (!db) {
    return (
      inMemoryNotificationPreferences.get(orgId) ?? {
        id: 0,
        orgId,
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        updatedAt: new Date(),
      }
    );
  }

  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.orgId, orgId))
    .limit(1);
  const preferences = rows[0];
  return (
    preferences ?? {
      id: 0,
      orgId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: new Date(),
    }
  );
}

export async function upsertNotificationPreferences(
  orgId: string,
  preferences: NotificationPreferencesInput
): Promise<NotificationPreferencesRecord> {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryNotificationPreferences.get(orgId);
    const saved: NotificationPreferencesRecord = {
      id: existing?.id ?? Date.now(),
      orgId,
      ...preferences,
      updatedAt: new Date(),
    };
    inMemoryNotificationPreferences.set(orgId, saved);
    return saved;
  }

  await db
    .insert(notificationPreferences)
    .values({ orgId, ...preferences })
    .onDuplicateKeyUpdate({
      set: { ...preferences, updatedAt: new Date() },
    });
  return getNotificationPreferences(orgId);
}

export async function getOutcomeFeedbackByOrganization(
  orgId: string
): Promise<OutcomeFeedbackRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryOutcomeFeedback.values())
      .filter(feedback => feedback.orgId === orgId)
      .sort(
        (first, second) =>
          first.recordedAt.getTime() - second.recordedAt.getTime()
      );
  }
  const rows = await db
    .select()
    .from(outcomeFeedback)
    .where(eq(outcomeFeedback.orgId, orgId))
    .orderBy(outcomeFeedback.recordedAt);
  return rows.map(row => ({
    ...row,
    orgId: row.orgId,
    resolutionReasonCode: row.resolutionReasonCode ?? null,
    recordedById: row.recordedById ?? null,
    recordedByName: row.recordedByName ?? null,
  }));
}

export async function upsertOutcomeFeedback(
  input: OutcomeFeedbackInput
): Promise<OutcomeFeedbackRecord> {
  const key = caseKey(input.orgId, input.transactionId);
  const db = await getDb();
  if (!db) {
    const saved: OutcomeFeedbackRecord = {
      ...input,
      id: inMemoryOutcomeFeedback.get(key)?.id ?? Date.now(),
      recordedAt: new Date(),
    };
    inMemoryOutcomeFeedback.set(key, saved);
    return saved;
  }

  await db
    .insert(outcomeFeedback)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        predictedRiskLabel: input.predictedRiskLabel,
        predictedProbability: input.predictedProbability,
        actualOutcome: input.actualOutcome,
        classification: input.classification,
        resolutionReasonCode: input.resolutionReasonCode,
        recordedById: input.recordedById,
        recordedByName: input.recordedByName,
        recordedAt: new Date(),
      },
    });
  const rows = await db
    .select()
    .from(outcomeFeedback)
    .where(
      and(
        eq(outcomeFeedback.orgId, input.orgId),
        eq(outcomeFeedback.transactionId, input.transactionId)
      )
    )
    .limit(1);
  const saved = rows[0];
  if (!saved) throw new Error("Outcome feedback could not be saved.");
  return {
    ...saved,
    orgId: saved.orgId,
    resolutionReasonCode: saved.resolutionReasonCode ?? null,
    recordedById: saved.recordedById ?? null,
    recordedByName: saved.recordedByName ?? null,
  };
}

export async function deleteOutcomeFeedback(
  orgId: string,
  transactionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    inMemoryOutcomeFeedback.delete(caseKey(orgId, transactionId));
    return;
  }
  await db
    .delete(outcomeFeedback)
    .where(
      and(
        eq(outcomeFeedback.orgId, orgId),
        eq(outcomeFeedback.transactionId, transactionId)
      )
    );
}

export async function createApiKey(input: ApiKeyInput): Promise<ApiKeyRecord> {
  const db = await getDb();
  const scopesJson = JSON.stringify(input.scopes);
  if (!db) {
    const saved: ApiKeyRecord = {
      ...input,
      id: inMemoryApiKeyId++,
      scopesJson,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    inMemoryApiKeys.set(saved.id, saved);
    return saved;
  }

  await db.insert(apiKeys).values({ ...input, scopesJson });
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, input.keyHash))
    .limit(1);
  const saved = rows[0];
  if (!saved) throw new Error("API key could not be saved.");
  return saved;
}

export async function getApiKeysByOrganization(
  orgId: string
): Promise<ApiKeyRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryApiKeys.values())
      .filter(key => key.orgId === orgId)
      .sort(
        (first, second) =>
          second.createdAt.getTime() - first.createdAt.getTime()
      );
  }
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function getApiKeyByHash(
  keyHash: string
): Promise<ApiKeyRecord | undefined> {
  const db = await getDb();
  if (!db)
    return Array.from(inMemoryApiKeys.values()).find(
      key => key.keyHash === keyHash
    );
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);
  return rows[0];
}

export async function revokeApiKey(
  orgId: string,
  keyId: number
): Promise<ApiKeyRecord | undefined> {
  const db = await getDb();
  if (!db) {
    const current = inMemoryApiKeys.get(keyId);
    if (!current || current.orgId !== orgId) return undefined;
    const revoked = { ...current, revokedAt: new Date() };
    inMemoryApiKeys.set(keyId, revoked);
    return revoked;
  }
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)));
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function touchApiKeyLastUsed(keyId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    const current = inMemoryApiKeys.get(keyId);
    if (current)
      inMemoryApiKeys.set(keyId, { ...current, lastUsedAt: new Date() });
    return;
  }
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyId));
}

export async function recordApiRequestLog(
  input: ApiRequestLogInput
): Promise<void> {
  const db = await getDb();
  if (!db) {
    inMemoryApiRequestLogs.push({
      ...input,
      id: inMemoryApiRequestLogId++,
      transactionReference: input.transactionReference ?? null,
      riskLevel: input.riskLevel ?? null,
      createdAt: new Date(),
    });
    return;
  }
  await db.insert(apiRequestLogs).values({
    ...input,
    transactionReference: input.transactionReference ?? null,
    riskLevel: input.riskLevel ?? null,
  });
}

export async function countApiRequestsSince(
  apiKeyId: number,
  since: Date
): Promise<number> {
  const db = await getDb();
  if (!db)
    return inMemoryApiRequestLogs.filter(
      entry => entry.apiKeyId === apiKeyId && entry.createdAt >= since
    ).length;
  const rows = await db
    .select({ total: count() })
    .from(apiRequestLogs)
    .where(
      and(
        eq(apiRequestLogs.apiKeyId, apiKeyId),
        gte(apiRequestLogs.createdAt, since)
      )
    );
  return Number(rows[0]?.total ?? 0);
}

export async function getApiRequestLogsByOrganization(
  orgId: string,
  limit = 100
): Promise<ApiRequestLogRecord[]> {
  const db = await getDb();
  if (!db)
    return inMemoryApiRequestLogs
      .filter(entry => entry.orgId === orgId)
      .slice(-limit)
      .reverse();
  return db
    .select()
    .from(apiRequestLogs)
    .where(eq(apiRequestLogs.orgId, orgId))
    .orderBy(desc(apiRequestLogs.createdAt))
    .limit(limit);
}

export async function getSavedQueueViewsByOrganization(
  orgId: string,
  ownerId: string
): Promise<SavedQueueViewRecord[]> {
  const db = await getDb();
  if (!db) {
    return (inMemorySavedQueueViews.get(orgId) ?? [])
      .filter(view => view.visibility === "shared" || view.ownerId === ownerId)
      .sort(
        (first, second) =>
          second.updatedAt.getTime() - first.updatedAt.getTime()
      );
  }
  const rows = await db
    .select()
    .from(savedQueueViews)
    .where(eq(savedQueueViews.orgId, orgId))
    .orderBy(desc(savedQueueViews.updatedAt));
  return rows.filter(
    view => view.visibility === "shared" || view.ownerId === ownerId
  );
}

export async function createSavedQueueView(
  input: SavedQueueViewInput
): Promise<SavedQueueViewRecord> {
  const filtersJson = JSON.stringify(input.filters);
  const db = await getDb();
  if (!db) {
    const now = new Date();
    const saved: SavedQueueViewRecord = {
      ...input,
      id: inMemorySavedQueueViewId++,
      filtersJson,
      createdAt: now,
      updatedAt: now,
    };
    const views = inMemorySavedQueueViews.get(input.orgId) ?? [];
    views.unshift(saved);
    inMemorySavedQueueViews.set(input.orgId, views);
    return saved;
  }
  await db.insert(savedQueueViews).values({ ...input, filtersJson });
  const rows = await db
    .select()
    .from(savedQueueViews)
    .where(
      and(
        eq(savedQueueViews.orgId, input.orgId),
        eq(savedQueueViews.ownerId, input.ownerId),
        eq(savedQueueViews.name, input.name)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Saved queue view could not be created.");
  return rows[0];
}

export async function deleteSavedQueueView(
  orgId: string,
  viewId: number,
  actorId: string,
  canManageShared: boolean
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    const views = inMemorySavedQueueViews.get(orgId) ?? [];
    const index = views.findIndex(view => view.id === viewId);
    const view = views[index];
    if (
      index < 0 ||
      !view ||
      (view.ownerId !== actorId &&
        !(canManageShared && view.visibility === "shared"))
    ) {
      return false;
    }
    views.splice(index, 1);
    inMemorySavedQueueViews.set(orgId, views);
    return true;
  }
  const rows = await db
    .select()
    .from(savedQueueViews)
    .where(
      and(eq(savedQueueViews.id, viewId), eq(savedQueueViews.orgId, orgId))
    )
    .limit(1);
  const view = rows[0];
  if (
    !view ||
    (view.ownerId !== actorId &&
      !(canManageShared && view.visibility === "shared"))
  ) {
    return false;
  }
  await db
    .delete(savedQueueViews)
    .where(
      and(eq(savedQueueViews.id, viewId), eq(savedQueueViews.orgId, orgId))
    );
  return true;
}

export async function reserveApiIdempotency(
  input: ApiIdempotencyInput
): Promise<{ record: ApiIdempotencyRecord; created: boolean }> {
  const key = `${input.apiKeyId}:${input.idempotencyKey}`;
  const now = new Date();
  const inMemoryExisting = inMemoryApiIdempotency.get(key);
  if (inMemoryExisting) {
    if (inMemoryExisting.expiresAt > now) {
      return { record: inMemoryExisting, created: false };
    }
    inMemoryApiIdempotency.delete(key);
  }

  const db = await getDb();
  if (!db) {
    const record: ApiIdempotencyRecord = {
      ...input,
      id: inMemoryApiIdempotencyId++,
      status: "processing",
      responseStatus: null,
      responseJson: null,
      transactionReference: null,
      createdAt: now,
    };
    inMemoryApiIdempotency.set(key, record);
    return { record, created: true };
  }

  const existingRows = await db
    .select()
    .from(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.apiKeyId, input.apiKeyId),
        eq(apiIdempotencyKeys.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (existingRows[0] && existingRows[0].expiresAt > now) {
    return { record: existingRows[0], created: false };
  }
  if (existingRows[0]) {
    await db
      .delete(apiIdempotencyKeys)
      .where(eq(apiIdempotencyKeys.id, existingRows[0].id));
  }

  try {
    await db.insert(apiIdempotencyKeys).values(input);
  } catch (error) {
    const racedRows = await db
      .select()
      .from(apiIdempotencyKeys)
      .where(
        and(
          eq(apiIdempotencyKeys.apiKeyId, input.apiKeyId),
          eq(apiIdempotencyKeys.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (racedRows[0]) return { record: racedRows[0], created: false };
    throw error;
  }
  const rows = await db
    .select()
    .from(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.apiKeyId, input.apiKeyId),
        eq(apiIdempotencyKeys.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Idempotency record could not be created.");
  return { record: rows[0], created: true };
}

export async function completeApiIdempotency(
  apiKeyId: number,
  idempotencyKey: string,
  responseStatus: number,
  responseJson: string,
  transactionReference: string | null
): Promise<void> {
  const key = `${apiKeyId}:${idempotencyKey}`;
  const current = inMemoryApiIdempotency.get(key);
  if (current) {
    inMemoryApiIdempotency.set(key, {
      ...current,
      status: "completed",
      responseStatus,
      responseJson,
      transactionReference,
    });
  }
  const db = await getDb();
  if (!db) return;
  await db
    .update(apiIdempotencyKeys)
    .set({
      status: "completed",
      responseStatus,
      responseJson,
      transactionReference,
    })
    .where(
      and(
        eq(apiIdempotencyKeys.apiKeyId, apiKeyId),
        eq(apiIdempotencyKeys.idempotencyKey, idempotencyKey)
      )
    );
}

export async function releaseApiIdempotency(
  apiKeyId: number,
  idempotencyKey: string
): Promise<void> {
  inMemoryApiIdempotency.delete(`${apiKeyId}:${idempotencyKey}`);
  const db = await getDb();
  if (!db) return;
  await db
    .delete(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.apiKeyId, apiKeyId),
        eq(apiIdempotencyKeys.idempotencyKey, idempotencyKey)
      )
    );
}

export async function getWeeklySummaryPreferences(
  orgId: string
): Promise<WeeklySummaryPreferencesRecord> {
  const db = await getDb();
  if (!db) {
    return (
      inMemoryWeeklySummaryPreferences.get(orgId) ?? {
        id: 0,
        orgId,
        ...DEFAULT_WEEKLY_SUMMARY_PREFERENCES,
        updatedAt: new Date(),
      }
    );
  }

  const rows = await db
    .select()
    .from(weeklySummaryPreferences)
    .where(eq(weeklySummaryPreferences.orgId, orgId))
    .limit(1);
  return (
    rows[0] ?? {
      id: 0,
      orgId,
      ...DEFAULT_WEEKLY_SUMMARY_PREFERENCES,
      updatedAt: new Date(),
    }
  );
}

export async function upsertWeeklySummaryPreferences(
  orgId: string,
  preferences: WeeklySummaryPreferencesInput
): Promise<WeeklySummaryPreferencesRecord> {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryWeeklySummaryPreferences.get(orgId);
    const saved: WeeklySummaryPreferencesRecord = {
      id: existing?.id ?? Date.now(),
      orgId,
      ...preferences,
      updatedAt: new Date(),
    };
    inMemoryWeeklySummaryPreferences.set(orgId, saved);
    return saved;
  }

  await db
    .insert(weeklySummaryPreferences)
    .values({ orgId, ...preferences })
    .onDuplicateKeyUpdate({
      set: { ...preferences, updatedAt: new Date() },
    });
  return getWeeklySummaryPreferences(orgId);
}

export async function getEnabledWeeklySummaryPreferences(): Promise<
  WeeklySummaryPreferencesRecord[]
> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryWeeklySummaryPreferences.values()).filter(
      preferences => preferences.enabled && Boolean(preferences.toEmail)
    );
  }
  return db
    .select()
    .from(weeklySummaryPreferences)
    .where(
      and(
        eq(weeklySummaryPreferences.enabled, true),
        gte(weeklySummaryPreferences.toEmail, "")
      )
    );
}

export async function hasWeeklySummaryDelivery(
  orgId: string,
  periodStart: Date
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return inMemoryWeeklySummaryDeliveries.some(
      delivery =>
        delivery.orgId === orgId &&
        delivery.periodStart.getTime() === periodStart.getTime()
    );
  }
  const rows = await db
    .select({ id: weeklySummaryDeliveries.id })
    .from(weeklySummaryDeliveries)
    .where(
      and(
        eq(weeklySummaryDeliveries.orgId, orgId),
        eq(weeklySummaryDeliveries.periodStart, periodStart)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function recordWeeklySummaryDelivery(
  input: WeeklySummaryDeliveryInput
): Promise<void> {
  const db = await getDb();
  if (!db) {
    inMemoryWeeklySummaryDeliveries.push({
      ...input,
      resendEmailId: input.resendEmailId ?? null,
      id: inMemoryWeeklySummaryId++,
      sentAt: new Date(),
    });
    return;
  }
  await db.insert(weeklySummaryDeliveries).values({
    ...input,
    resendEmailId: input.resendEmailId ?? null,
  });
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const db = await getDb();
  if (!db) {
    const organizationEvents = inMemoryAuditEvents.get(input.orgId) ?? [];
    organizationEvents.unshift({
      ...input,
      id: Date.now() + organizationEvents.length,
      metadataJson,
      createdAt: new Date(),
    });
    inMemoryAuditEvents.set(input.orgId, organizationEvents);
    return;
  }

  await db.insert(auditEvents).values({
    orgId: input.orgId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorName: input.actorName,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    summary: input.summary,
    metadataJson,
  });
}

export async function getAuditEventsByOrganization(
  orgId: string,
  limit = 100
): Promise<AuditEventRecord[]> {
  const db = await getDb();
  if (!db) return (inMemoryAuditEvents.get(orgId) ?? []).slice(0, limit);
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function getCaseActivity(
  orgId: string,
  transactionId: number,
  limit = 100
): Promise<AuditEventRecord[]> {
  const subjectId = String(transactionId);
  const db = await getDb();
  if (!db)
    return (inMemoryAuditEvents.get(orgId) ?? [])
      .filter(
        event => event.subjectType === "case" && event.subjectId === subjectId
      )
      .slice(0, limit);
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, orgId),
        eq(auditEvents.subjectType, "case"),
        eq(auditEvents.subjectId, subjectId)
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function addCaseComment(input: CaseCommentInput): Promise<void> {
  const db = await getDb();
  if (!db) {
    const key = caseKey(input.orgId, input.transactionId);
    const comments = inMemoryComments.get(key) ?? [];
    comments.unshift({
      ...input,
      id: inMemoryCaseArtifactId++,
      createdAt: new Date(),
    });
    inMemoryComments.set(key, comments);
    return;
  }
  await db.insert(caseNotes).values(input);
}

export async function replaceCaseTags(
  orgId: string,
  transactionId: number,
  tags: string[]
): Promise<void> {
  const uniqueTags = Array.from(
    new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))
  );
  const db = await getDb();
  if (!db) {
    inMemoryTags.set(
      caseKey(orgId, transactionId),
      uniqueTags.map(tag => ({
        id: inMemoryCaseArtifactId++,
        orgId,
        transactionId,
        tag,
        createdAt: new Date(),
      }))
    );
    return;
  }
  await db
    .delete(caseTags)
    .where(
      and(eq(caseTags.orgId, orgId), eq(caseTags.transactionId, transactionId))
    );
  if (uniqueTags.length)
    await db
      .insert(caseTags)
      .values(uniqueTags.map(tag => ({ orgId, transactionId, tag })));
}

export async function addCaseEvidence(input: CaseEvidenceInput): Promise<void> {
  const db = await getDb();
  if (!db) {
    const key = caseKey(input.orgId, input.transactionId);
    const evidence = inMemoryEvidence.get(key) ?? [];
    evidence.unshift({
      ...input,
      id: inMemoryCaseArtifactId++,
      createdAt: new Date(),
    });
    inMemoryEvidence.set(key, evidence);
    return;
  }
  await db.insert(caseEvidence).values(input);
}

export async function getCaseEvidenceByStorageKey(
  orgId: string,
  storageKey: string
): Promise<CaseEvidenceRecord | undefined> {
  const db = await getDb();
  if (!db) {
    const evidence = Array.from(inMemoryEvidence.entries())
      .filter(([key]) => key.startsWith(`${orgId}:`))
      .flatMap(([, entries]) => entries);
    return evidence.find(
      item =>
        item.storageKey === storageKey && item.evidenceType === "attachment"
    );
  }
  const records = await db
    .select()
    .from(caseEvidence)
    .where(
      and(
        eq(caseEvidence.orgId, orgId),
        eq(caseEvidence.storageKey, storageKey),
        eq(caseEvidence.evidenceType, "attachment")
      )
    )
    .limit(1);
  const record = records[0];
  return record ? { ...record, orgId: record.orgId ?? orgId } : undefined;
}

export async function getCaseCollaboration(
  orgId: string,
  transactionId: number
) {
  const db = await getDb();
  if (!db) {
    const key = caseKey(orgId, transactionId);
    return {
      comments: inMemoryComments.get(key) ?? [],
      tags: inMemoryTags.get(key) ?? [],
      evidence: inMemoryEvidence.get(key) ?? [],
      activity: await getCaseActivity(orgId, transactionId),
    };
  }
  const [comments, tags, evidence, activity] = await Promise.all([
    db
      .select()
      .from(caseNotes)
      .where(
        and(
          eq(caseNotes.orgId, orgId),
          eq(caseNotes.transactionId, transactionId)
        )
      )
      .orderBy(desc(caseNotes.createdAt)),
    db
      .select()
      .from(caseTags)
      .where(
        and(
          eq(caseTags.orgId, orgId),
          eq(caseTags.transactionId, transactionId)
        )
      )
      .orderBy(desc(caseTags.createdAt)),
    db
      .select()
      .from(caseEvidence)
      .where(
        and(
          eq(caseEvidence.orgId, orgId),
          eq(caseEvidence.transactionId, transactionId)
        )
      )
      .orderBy(desc(caseEvidence.createdAt)),
    getCaseActivity(orgId, transactionId),
  ]);
  return { comments, tags, evidence, activity };
}

export async function persistTransaction(
  orgId: string,
  record: Omit<InsertTransaction, "orgId">
) {
  const db = await getDb();
  if (!db) return;

  const organizationRecord: InsertTransaction = { ...record, orgId };
  try {
    await db
      .insert(transactions)
      .values(organizationRecord)
      .onDuplicateKeyUpdate({
        set: {
          riskLabel: organizationRecord.riskLabel,
          riskProbability: organizationRecord.riskProbability,
          factorJson: organizationRecord.factorJson,
          policySignalJson: organizationRecord.policySignalJson,
          policyVersion: organizationRecord.policyVersion,
          deterministicExplanation: organizationRecord.deterministicExplanation,
          llmSummary: organizationRecord.llmSummary,
          llmNextStep: organizationRecord.llmNextStep,
          caseStatus: organizationRecord.caseStatus,
          caseNote: organizationRecord.caseNote,
          resolutionReasonCode: organizationRecord.resolutionReasonCode,
          assigneeId: organizationRecord.assigneeId,
          assigneeName: organizationRecord.assigneeName,
          casePriority: organizationRecord.casePriority,
          dueAt: organizationRecord.dueAt,
          isNew: organizationRecord.isNew,
        },
      });
  } catch (error) {
    console.error("[FraudLens] Transaction persistence failed", error);
    throw new Error("Transaction persistence failed.", { cause: error });
  }
}
