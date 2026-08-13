import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { auditEvents, InsertUser, InsertTransaction, transactions, users } from "../drizzle/schema";
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

const inMemoryAuditEvents = new Map<string, AuditEventRecord[]>();

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

  const values = {
    orgId: input.orgId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorName: input.actorName,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    summary: input.summary,
    metadataJson,
  };
  await db.insert(auditEvents).values(values);
}

export async function getAuditEventsByOrganization(orgId: string, limit = 100): Promise<AuditEventRecord[]> {
  const db = await getDb();
  if (!db) return (inMemoryAuditEvents.get(orgId) ?? []).slice(0, limit);
  return db.select().from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
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
