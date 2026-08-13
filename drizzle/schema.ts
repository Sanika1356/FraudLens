import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["analyst", "manager", "admin"]).default("analyst").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier. Nullable to preserve existing rows during migration. */
  orgId: varchar("orgId", { length: 64 }),
  reference: varchar("reference", { length: 32 }).notNull(),
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
  /** Standardized reason selected when a case is resolved. */
  resolutionReasonCode: varchar("resolutionReasonCode", { length: 64 }),
  /** Current organization member responsible for an open case. */
  assigneeId: varchar("assigneeId", { length: 64 }),
  assigneeName: varchar("assigneeName", { length: 160 }),
  casePriority: mysqlEnum("casePriority", ["critical", "high", "standard"]).default("standard").notNull(),
  dueAt: timestamp("dueAt"),
  isNew: boolean("isNew").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("transactions_org_reference_unique").on(table.orgId, table.reference)]);

export const caseNotes = mysqlTable("caseNotes", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier for tenant-safe case history. */
  orgId: varchar("orgId", { length: 64 }),
  transactionId: int("transactionId").notNull(),
  note: text("note").notNull(),
  authorId: varchar("authorId", { length: 64 }),
  authorName: varchar("authorName", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const caseTags = mysqlTable("caseTags", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier used to keep case labels tenant-isolated. */
  orgId: varchar("orgId", { length: 64 }),
  transactionId: int("transactionId").notNull(),
  tag: varchar("tag", { length: 48 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const caseEvidence = mysqlTable("caseEvidence", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier used to prevent cross-workspace evidence access. */
  orgId: varchar("orgId", { length: 64 }),
  transactionId: int("transactionId").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  evidenceType: mysqlEnum("evidenceType", ["link", "attachment"]).notNull(),
  url: text("url").notNull(),
  storageKey: varchar("storageKey", { length: 500 }),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 120 }),
  addedById: varchar("addedById", { length: 64 }),
  addedByName: varchar("addedByName", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier for tenant-isolated, append-only activity history. */
  orgId: varchar("orgId", { length: 64 }),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  actorId: varchar("actorId", { length: 64 }),
  actorName: varchar("actorName", { length: 160 }),
  subjectType: varchar("subjectType", { length: 64 }),
  subjectId: varchar("subjectId", { length: 80 }),
  summary: text("summary").notNull(),
  metadataJson: text("metadataJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  /** Exactly one alert configuration is allowed for each active Clerk organization. */
  orgId: varchar("orgId", { length: 64 }).notNull().unique(),
  emailEnabled: boolean("emailEnabled").default(false).notNull(),
  toEmail: varchar("toEmail", { length: 320 }),
  slackEnabled: boolean("slackEnabled").default(false).notNull(),
  /** Stored server-side because incoming webhook URLs are channel secrets. */
  slackWebhookUrl: varchar("slackWebhookUrl", { length: 2048 }),
  teamsEnabled: boolean("teamsEnabled").default(false).notNull(),
  /** Power Automate/Teams workflow URL. Legacy connector URLs are not required. */
  teamsWebhookUrl: varchar("teamsWebhookUrl", { length: 2048 }),
  riskThreshold: int("riskThreshold").default(80).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const outcomeFeedback = mysqlTable("outcomeFeedback", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier keeps analyst feedback inside the active workspace. */
  orgId: varchar("orgId", { length: 64 }).notNull(),
  transactionId: int("transactionId").notNull(),
  /** The model decision at the time of assessment; high risk is treated as a positive prediction. */
  predictedRiskLabel: mysqlEnum("predictedRiskLabel", ["low", "medium", "high"]).notNull(),
  predictedProbability: int("predictedProbability").notNull(),
  /** Human-confirmed case result, never inferred automatically. */
  actualOutcome: mysqlEnum("actualOutcome", ["fraud", "legitimate"]).notNull(),
  classification: mysqlEnum("classification", ["true_positive", "false_positive", "false_negative", "true_negative"]).notNull(),
  resolutionReasonCode: varchar("resolutionReasonCode", { length: 64 }),
  recordedById: varchar("recordedById", { length: 64 }),
  recordedByName: varchar("recordedByName", { length: 160 }),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("outcome_feedback_org_transaction_unique").on(table.orgId, table.transactionId)]);

export const apiKeys = mysqlTable("apiKeys", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier; keys are never valid outside their issuing workspace. */
  orgId: varchar("orgId", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  /** Non-secret lookup prefix shown in the management interface. */
  keyPrefix: varchar("keyPrefix", { length: 24 }).notNull(),
  /** SHA-256 digest of the full key. The plaintext secret is never persisted. */
  keyHash: varchar("keyHash", { length: 128 }).notNull(),
  /** JSON array retained for forward-compatible, least-privilege API scopes. */
  scopesJson: varchar("scopesJson", { length: 255 }).notNull(),
  createdById: varchar("createdById", { length: 64 }),
  createdByName: varchar("createdByName", { length: 160 }),
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
  index("api_keys_org_created_idx").on(table.orgId, table.createdAt),
]);

export const apiRequestLogs = mysqlTable("apiRequestLogs", {
  id: int("id").autoincrement().primaryKey(),
  /** Organization and key identifier allow rate-limit and activity analysis without retaining request bodies. */
  orgId: varchar("orgId", { length: 64 }).notNull(),
  apiKeyId: int("apiKeyId"),
  requestId: varchar("requestId", { length: 64 }).notNull(),
  endpoint: varchar("endpoint", { length: 160 }).notNull(),
  method: varchar("method", { length: 8 }).notNull(),
  responseStatus: int("responseStatus").notNull(),
  transactionReference: varchar("transactionReference", { length: 32 }),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("api_request_logs_org_created_idx").on(table.orgId, table.createdAt),
  index("api_request_logs_key_created_idx").on(table.apiKeyId, table.createdAt),
]);

export const weeklySummaryPreferences = mysqlTable("weeklySummaryPreferences", {
  id: int("id").autoincrement().primaryKey(),
  /** Exactly one weekly-summary configuration is permitted per organization. */
  orgId: varchar("orgId", { length: 64 }).notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  /** Report recipient is kept separate from high-risk alert recipients. */
  toEmail: varchar("toEmail", { length: 320 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const weeklySummaryDeliveries = mysqlTable("weeklySummaryDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  /** A successful weekly report is recorded once per organization and reporting period. */
  orgId: varchar("orgId", { length: 64 }).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  resendEmailId: varchar("resendEmailId", { length: 128 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("weekly_summary_deliveries_org_period_unique").on(table.orgId, table.periodStart),
  index("weekly_summary_deliveries_org_sent_idx").on(table.orgId, table.sentAt),
]);

export const modelMetricSnapshots = mysqlTable("modelMetricSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  /** Clerk organization identifier for workspace-level model metrics. */
  orgId: varchar("orgId", { length: 64 }),
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
  /** Clerk organization identifier for workspace-level drift snapshots. */
  orgId: varchar("orgId", { length: 64 }),
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
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;
export type OutcomeFeedback = typeof outcomeFeedback.$inferSelect;
export type InsertOutcomeFeedback = typeof outcomeFeedback.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type ApiRequestLog = typeof apiRequestLogs.$inferSelect;
export type InsertApiRequestLog = typeof apiRequestLogs.$inferInsert;
export type WeeklySummaryPreferences = typeof weeklySummaryPreferences.$inferSelect;
export type InsertWeeklySummaryPreferences = typeof weeklySummaryPreferences.$inferInsert;
export type WeeklySummaryDelivery = typeof weeklySummaryDeliveries.$inferSelect;
export type InsertWeeklySummaryDelivery = typeof weeklySummaryDeliveries.$inferInsert;
