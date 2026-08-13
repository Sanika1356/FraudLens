import { and, count, desc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { apiKeys, apiRequestLogs, auditEvents, caseEvidence, caseNotes, caseTags, InsertUser, InsertTransaction, notificationPreferences, outcomeFeedback, transactions, users } from "../drizzle/schema";
import type { ActualOutcome, OutcomeClassification } from "./outcomeFeedback";
import { ENV } from "./_core/env";

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

export type CaseCommentInput = {
  orgId: string;
  transactionId: number;
  note: string;
  authorId: string | null;
  authorName: string;
};

export type CaseCommentRecord = CaseCommentInput & { id: number; createdAt: Date };
export type CaseTagRecord = { id: number; orgId: string | null; transactionId: number; tag: string; createdAt: Date };
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
export type CaseEvidenceRecord = CaseEvidenceInput & { id: number; createdAt: Date };

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
export type ApiRequestLogRecord = ApiRequestLogInput & { id: number; createdAt: Date };

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
const inMemoryNotificationPreferences = new Map<string, NotificationPreferencesRecord>();
const inMemoryOutcomeFeedback = new Map<string, OutcomeFeedbackRecord>();
const inMemoryApiKeys = new Map<number, ApiKeyRecord>();
const inMemoryApiRequestLogs: ApiRequestLogRecord[] = [];
let inMemoryCaseArtifactId = 1;
let inMemoryApiKeyId = 1;
let inMemoryApiRequestLogId = 1;

function caseKey(orgId: string, transactionId: number) {
  return `${orgId}:${transactionId}`;
}

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    database = drizzle(process.env.DATABASE_URL);
  }
  return database;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { ...user, lastSignedIn: user.lastSignedIn ?? new Date() };
  if (user.openId === ENV.ownerOpenId) values.role = "admin";
  await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getTransactionsByOrganization(orgId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions)
    .where(eq(transactions.orgId, orgId))
    .orderBy(desc(transactions.createdAt));
}

export async function getTransactionReferencesByOrganization(orgId: string): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ reference: transactions.reference }).from(transactions)
    .where(eq(transactions.orgId, orgId));
  return new Set(rows.map((row) => row.reference.trim().toUpperCase()));
}

export async function getNotificationPreferences(orgId: string): Promise<NotificationPreferencesRecord> {
  const db = await getDb();
  if (!db) {
    return inMemoryNotificationPreferences.get(orgId) ?? {
      id: 0,
      orgId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: new Date(),
    };
  }

  const rows = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.orgId, orgId))
    .limit(1);
  const preferences = rows[0];
  return preferences ?? {
    id: 0,
    orgId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    updatedAt: new Date(),
  };
}

export async function upsertNotificationPreferences(
  orgId: string,
  preferences: NotificationPreferencesInput,
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

  await db.insert(notificationPreferences).values({ orgId, ...preferences }).onDuplicateKeyUpdate({
    set: { ...preferences, updatedAt: new Date() },
  });
  return getNotificationPreferences(orgId);
}

export async function getOutcomeFeedbackByOrganization(orgId: string): Promise<OutcomeFeedbackRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryOutcomeFeedback.values())
      .filter((feedback) => feedback.orgId === orgId)
      .sort((first, second) => first.recordedAt.getTime() - second.recordedAt.getTime());
  }
  const rows = await db.select().from(outcomeFeedback)
    .where(eq(outcomeFeedback.orgId, orgId))
    .orderBy(outcomeFeedback.recordedAt);
  return rows.map((row) => ({
    ...row,
    orgId: row.orgId,
    resolutionReasonCode: row.resolutionReasonCode ?? null,
    recordedById: row.recordedById ?? null,
    recordedByName: row.recordedByName ?? null,
  }));
}

export async function upsertOutcomeFeedback(input: OutcomeFeedbackInput): Promise<OutcomeFeedbackRecord> {
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

  await db.insert(outcomeFeedback).values(input).onDuplicateKeyUpdate({
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
  const rows = await db.select().from(outcomeFeedback)
    .where(and(eq(outcomeFeedback.orgId, input.orgId), eq(outcomeFeedback.transactionId, input.transactionId)))
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

export async function deleteOutcomeFeedback(orgId: string, transactionId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    inMemoryOutcomeFeedback.delete(caseKey(orgId, transactionId));
    return;
  }
  await db.delete(outcomeFeedback).where(and(eq(outcomeFeedback.orgId, orgId), eq(outcomeFeedback.transactionId, transactionId)));
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
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, input.keyHash)).limit(1);
  const saved = rows[0];
  if (!saved) throw new Error("API key could not be saved.");
  return saved;
}

export async function getApiKeysByOrganization(orgId: string): Promise<ApiKeyRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryApiKeys.values())
      .filter((key) => key.orgId === orgId)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
  }
  return db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId)).orderBy(desc(apiKeys.createdAt));
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | undefined> {
  const db = await getDb();
  if (!db) return Array.from(inMemoryApiKeys.values()).find((key) => key.keyHash === keyHash);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  return rows[0];
}

export async function revokeApiKey(orgId: string, keyId: number): Promise<ApiKeyRecord | undefined> {
  const db = await getDb();
  if (!db) {
    const current = inMemoryApiKeys.get(keyId);
    if (!current || current.orgId !== orgId) return undefined;
    const revoked = { ...current, revokedAt: new Date() };
    inMemoryApiKeys.set(keyId, revoked);
    return revoked;
  }
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)));
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId))).limit(1);
  return rows[0];
}

export async function touchApiKeyLastUsed(keyId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    const current = inMemoryApiKeys.get(keyId);
    if (current) inMemoryApiKeys.set(keyId, { ...current, lastUsedAt: new Date() });
    return;
  }
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
}

export async function recordApiRequestLog(input: ApiRequestLogInput): Promise<void> {
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

export async function countApiRequestsSince(apiKeyId: number, since: Date): Promise<number> {
  const db = await getDb();
  if (!db) return inMemoryApiRequestLogs.filter((entry) => entry.apiKeyId === apiKeyId && entry.createdAt >= since).length;
  const rows = await db.select({ total: count() }).from(apiRequestLogs)
    .where(and(eq(apiRequestLogs.apiKeyId, apiKeyId), gte(apiRequestLogs.createdAt, since)));
  return Number(rows[0]?.total ?? 0);
}

export async function getApiRequestLogsByOrganization(orgId: string, limit = 100): Promise<ApiRequestLogRecord[]> {
  const db = await getDb();
  if (!db) return inMemoryApiRequestLogs.filter((entry) => entry.orgId === orgId).slice(-limit).reverse();
  return db.select().from(apiRequestLogs).where(eq(apiRequestLogs.orgId, orgId)).orderBy(desc(apiRequestLogs.createdAt)).limit(limit);
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const db = await getDb();
  if (!db) {
    const organizationEvents = inMemoryAuditEvents.get(input.orgId) ?? [];
    organizationEvents.unshift({ ...input, id: Date.now() + organizationEvents.length, metadataJson, createdAt: new Date() });
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

export async function getAuditEventsByOrganization(orgId: string, limit = 100): Promise<AuditEventRecord[]> {
  const db = await getDb();
  if (!db) return (inMemoryAuditEvents.get(orgId) ?? []).slice(0, limit);
  return db.select().from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function getCaseActivity(orgId: string, transactionId: number, limit = 100): Promise<AuditEventRecord[]> {
  const subjectId = String(transactionId);
  const db = await getDb();
  if (!db) return (inMemoryAuditEvents.get(orgId) ?? []).filter((event) => event.subjectType === "case" && event.subjectId === subjectId).slice(0, limit);
  return db.select().from(auditEvents)
    .where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.subjectType, "case"), eq(auditEvents.subjectId, subjectId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function addCaseComment(input: CaseCommentInput): Promise<void> {
  const db = await getDb();
  if (!db) {
    const key = caseKey(input.orgId, input.transactionId);
    const comments = inMemoryComments.get(key) ?? [];
    comments.unshift({ ...input, id: inMemoryCaseArtifactId++, createdAt: new Date() });
    inMemoryComments.set(key, comments);
    return;
  }
  await db.insert(caseNotes).values(input);
}

export async function replaceCaseTags(orgId: string, transactionId: number, tags: string[]): Promise<void> {
  const uniqueTags = Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
  const db = await getDb();
  if (!db) {
    inMemoryTags.set(caseKey(orgId, transactionId), uniqueTags.map((tag) => ({ id: inMemoryCaseArtifactId++, orgId, transactionId, tag, createdAt: new Date() })));
    return;
  }
  await db.delete(caseTags).where(and(eq(caseTags.orgId, orgId), eq(caseTags.transactionId, transactionId)));
  if (uniqueTags.length) await db.insert(caseTags).values(uniqueTags.map((tag) => ({ orgId, transactionId, tag })));
}

export async function addCaseEvidence(input: CaseEvidenceInput): Promise<void> {
  const db = await getDb();
  if (!db) {
    const key = caseKey(input.orgId, input.transactionId);
    const evidence = inMemoryEvidence.get(key) ?? [];
    evidence.unshift({ ...input, id: inMemoryCaseArtifactId++, createdAt: new Date() });
    inMemoryEvidence.set(key, evidence);
    return;
  }
  await db.insert(caseEvidence).values(input);
}

export async function getCaseEvidenceByStorageKey(orgId: string, storageKey: string): Promise<CaseEvidenceRecord | undefined> {
  const db = await getDb();
  if (!db) {
    const evidence = Array.from(inMemoryEvidence.entries())
      .filter(([key]) => key.startsWith(`${orgId}:`))
      .flatMap(([, entries]) => entries);
    return evidence.find((item) => item.storageKey === storageKey && item.evidenceType === "attachment");
  }
  const records = await db.select().from(caseEvidence)
    .where(and(eq(caseEvidence.orgId, orgId), eq(caseEvidence.storageKey, storageKey), eq(caseEvidence.evidenceType, "attachment")))
    .limit(1);
  const record = records[0];
  return record ? { ...record, orgId: record.orgId ?? orgId } : undefined;
}

export async function getCaseCollaboration(orgId: string, transactionId: number) {
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
    db.select().from(caseNotes).where(and(eq(caseNotes.orgId, orgId), eq(caseNotes.transactionId, transactionId))).orderBy(desc(caseNotes.createdAt)),
    db.select().from(caseTags).where(and(eq(caseTags.orgId, orgId), eq(caseTags.transactionId, transactionId))).orderBy(desc(caseTags.createdAt)),
    db.select().from(caseEvidence).where(and(eq(caseEvidence.orgId, orgId), eq(caseEvidence.transactionId, transactionId))).orderBy(desc(caseEvidence.createdAt)),
    getCaseActivity(orgId, transactionId),
  ]);
  return { comments, tags, evidence, activity };
}

export async function persistTransaction(
  orgId: string,
  record: Omit<InsertTransaction, "orgId">,
) {
  const db = await getDb();
  if (!db) return;

  const organizationRecord: InsertTransaction = { ...record, orgId };
  try {
    await db.insert(transactions).values(organizationRecord).onDuplicateKeyUpdate({
      set: {
        riskLabel: organizationRecord.riskLabel,
        riskProbability: organizationRecord.riskProbability,
        factorJson: organizationRecord.factorJson,
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
  }
}
