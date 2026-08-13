import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  amountCents: int("amountCents").notNull(),
  merchantCategory: varchar("merchantCategory", { length: 80 }).notNull(),
  transactionCountry: varchar("transactionCountry", { length: 3 }).notNull(),
  accountCountry: varchar("accountCountry", { length: 3 }).notNull(),
  deviceStatus: mysqlEnum("deviceStatus", ["known", "new"]).notNull(),
  transactionHour: int("transactionHour").notNull(),
  recentTransactionCount: int("recentTransactionCount").notNull(),
  riskLabel: mysqlEnum("riskLabel", ["low", "medium", "high"]).notNull(),
  riskProbability: int("riskProbability").notNull(),
  factorJson: text("factorJson").notNull(),
  deterministicExplanation: text("deterministicExplanation").notNull(),
  llmSummary: text("llmSummary"),
  llmNextStep: text("llmNextStep"),
  caseStatus: mysqlEnum("caseStatus", ["under_review", "confirmed_fraud", "legitimate"]).default("under_review").notNull(),
  caseNote: text("caseNote"),
  isNew: boolean("isNew").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const caseNotes = mysqlTable("caseNotes", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  note: text("note").notNull(),
  authorName: varchar("authorName", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const modelMetricSnapshots = mysqlTable("modelMetricSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  modelLabel: varchar("modelLabel", { length: 200 }).notNull(),
  datasetLabel: varchar("datasetLabel", { length: 250 }).notNull(),
  precisionMilli: int("precisionMilli").notNull(),
  recallMilli: int("recallMilli").notNull(),
  f1Milli: int("f1Milli").notNull(),
  trueNegative: int("trueNegative").notNull(),
  falsePositive: int("falsePositive").notNull(),
  falseNegative: int("falseNegative").notNull(),
  truePositive: int("truePositive").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export const driftSnapshots = mysqlTable("driftSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  featureName: varchar("featureName", { length: 100 }).notNull(),
  baselineLabel: varchar("baselineLabel", { length: 120 }).notNull(),
  recentLabel: varchar("recentLabel", { length: 120 }).notNull(),
  changePercent: int("changePercent").notNull(),
  status: mysqlEnum("status", ["stable", "watch", "elevated"]).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
