import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { auditEvents, caseEvidence, caseNotes, caseTags, InsertUser, InsertTransaction, transactions, users } from "../drizzle/schema";
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

const inMemoryAuditEvents = new Map<string, AuditEventRecord[]>();
const inMemoryComments = new Map<string, CaseCommentRecord[]>();
const inMemoryTags = new Map<string, CaseTagRecord[]>();
const inMemoryEvidence = new Map<string, CaseEvidenceRecord[]>();
let inMemoryCaseArtifactId = 1;

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
