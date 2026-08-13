import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertTransaction, transactions, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;

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

export async function persistTransaction(record: InsertTransaction) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(transactions).values(record).onDuplicateKeyUpdate({
      set: {
        riskLabel: record.riskLabel,
        riskProbability: record.riskProbability,
        factorJson: record.factorJson,
        deterministicExplanation: record.deterministicExplanation,
        llmSummary: record.llmSummary,
        llmNextStep: record.llmNextStep,
        caseStatus: record.caseStatus,
        caseNote: record.caseNote,
        isNew: record.isNew,
      },
    });
  } catch (error) {
    console.error("[FraudLens] Transaction persistence failed", error);
  }
}
