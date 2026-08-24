import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["analyst", "manager", "admin"])
    .default("analyst")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizationRoles = mysqlTable(
  "organizationRoles",
  {
    id: int("id").autoincrement().primaryKey(),
    /** FraudLens application role scoped to one Clerk organization and user. */
    orgId: varchar("orgId", { length: 64 }).notNull(),
    openId: varchar("openId", { length: 64 }).notNull(),
    role: mysqlEnum("role", ["analyst", "manager", "admin"])
      .default("analyst")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("organization_roles_org_open_unique").on(
      table.orgId,
      table.openId
    ),
    index("organization_roles_org_idx").on(table.orgId),
  ]
);

export const riskPolicyVersions = mysqlTable(
  "riskPolicyVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    version: int("version").notNull(),
    status: mysqlEnum("status", ["draft", "active", "retired"]).notNull(),
    configJson: text("configJson").notNull(),
    changeNote: varchar("changeNote", { length: 500 }).notNull(),
    createdById: varchar("createdById", { length: 64 }),
    createdByName: varchar("createdByName", { length: 160 }),
    approvedById: varchar("approvedById", { length: 64 }),
    approvedByName: varchar("approvedByName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
  },
  table => [
    uniqueIndex("risk_policy_versions_org_version_unique").on(
      table.orgId,
      table.version
    ),
    index("risk_policy_versions_org_status_idx").on(table.orgId, table.status),
  ]
);

export const retentionPolicyVersions = mysqlTable(
  "retentionPolicyVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    version: int("version").notNull(),
    status: mysqlEnum("status", ["draft", "active", "retired"]).notNull(),
    transactionRetentionDays: int("transactionRetentionDays").notNull(),
    evidenceRetentionDays: int("evidenceRetentionDays").notNull(),
    auditRetentionDays: int("auditRetentionDays").notNull(),
    effectiveAt: timestamp("effectiveAt").notNull(),
    changeNote: varchar("changeNote", { length: 500 }).notNull(),
    createdById: varchar("createdById", { length: 64 }),
    createdByName: varchar("createdByName", { length: 160 }),
    approvedById: varchar("approvedById", { length: 64 }),
    approvedByName: varchar("approvedByName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
  },
  table => [
    uniqueIndex("retention_policy_versions_org_version_unique").on(
      table.orgId,
      table.version
    ),
    index("retention_policy_versions_org_status_idx").on(
      table.orgId,
      table.status
    ),
  ]
);
export const modelRegistryVersions = mysqlTable(
  "modelRegistryVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    modelKey: varchar("modelKey", { length: 80 }).notNull(),
    version: varchar("version", { length: 40 }).notNull(),
    status: mysqlEnum("status", [
      "champion",
      "challenger",
      "retired",
    ]).notNull(),
    artifactHash: varchar("artifactHash", { length: 128 }).notNull(),
    datasetLabel: varchar("datasetLabel", { length: 250 }).notNull(),
    evaluationJson: text("evaluationJson").notNull(),
    changeNote: varchar("changeNote", { length: 500 }).notNull(),
    createdById: varchar("createdById", { length: 64 }),
    createdByName: varchar("createdByName", { length: 160 }),
    approvedById: varchar("approvedById", { length: 64 }),
    approvedByName: varchar("approvedByName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
  },
  table => [
    uniqueIndex("model_registry_org_key_version_unique").on(
      table.orgId,
      table.modelKey,
      table.version
    ),
    index("model_registry_org_status_idx").on(table.orgId, table.status),
  ]
);
export const transactions = mysqlTable(
  "transactions",
  {
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
    /** Derived operational signals; these do not change the authoritative model score. */
    policySignalJson: text("policySignalJson").notNull(),
    /** Version of the approved policy used when this assessment was created. */
    policyVersion: varchar("policyVersion", { length: 32 })
      .notNull()
      .default("v1"),
    deterministicExplanation: text("deterministicExplanation").notNull(),
    llmSummary: text("llmSummary"),
    llmNextStep: text("llmNextStep"),
    caseStatus: mysqlEnum("caseStatus", [
      "under_review",
      "confirmed_fraud",
      "legitimate",
    ])
      .default("under_review")
      .notNull(),
    caseNote: text("caseNote"),
    /** Standardized reason selected when a case is resolved. */
    resolutionReasonCode: varchar("resolutionReasonCode", { length: 64 }),
    /** Current organization member responsible for an open case. */
    assigneeId: varchar("assigneeId", { length: 64 }),
    assigneeName: varchar("assigneeName", { length: 160 }),
    casePriority: mysqlEnum("casePriority", ["critical", "high", "standard"])
      .default("standard")
      .notNull(),
    dueAt: timestamp("dueAt"),
    isNew: boolean("isNew").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("transactions_org_reference_unique").on(
      table.orgId,
      table.reference
    ),
  ]
);

export const caseChecklistItems = mysqlTable(
  "caseChecklistItems",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    transactionId: int("transactionId").notNull(),
    itemKey: varchar("itemKey", { length: 64 }).notNull(),
    completed: boolean("completed").default(false).notNull(),
    note: varchar("note", { length: 500 }).notNull().default(""),
    completedById: varchar("completedById", { length: 64 }),
    completedByName: varchar("completedByName", { length: 160 }),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("case_checklist_org_transaction_key_unique").on(
      table.orgId,
      table.transactionId,
      table.itemKey
    ),
    index("case_checklist_org_transaction_idx").on(
      table.orgId,
      table.transactionId
    ),
  ]
);

export const riskEntities = mysqlTable(
  "riskEntities",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    entityType: mysqlEnum("entityType", [
      "merchant_category",
      "country_route",
      "device_cohort",
    ]).notNull(),
    entityKey: varchar("entityKey", { length: 128 }).notNull(),
    displayLabel: varchar("displayLabel", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("risk_entities_org_type_key_unique").on(
      table.orgId,
      table.entityType,
      table.entityKey
    ),
    index("risk_entities_org_idx").on(table.orgId),
  ]
);

export const transactionEntityLinks = mysqlTable(
  "transactionEntityLinks",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    transactionId: int("transactionId").notNull(),
    entityId: int("entityId").notNull(),
    relationship: varchar("relationship", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("transaction_entity_links_unique").on(
      table.orgId,
      table.transactionId,
      table.entityId
    ),
    index("transaction_entity_links_org_entity_idx").on(
      table.orgId,
      table.entityId
    ),
  ]
);

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

export const organizationControls = mysqlTable("organizationControls", {
  id: int("id").autoincrement().primaryKey(),
  orgId: varchar("orgId", { length: 64 }).notNull().unique(),
  incidentMode: boolean("incidentMode").default(false).notNull(),
  incidentNote: varchar("incidentNote", { length: 500 }),
  incidentActivatedById: varchar("incidentActivatedById", { length: 64 }),
  incidentActivatedByName: varchar("incidentActivatedByName", { length: 160 }),
  incidentActivatedAt: timestamp("incidentActivatedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const outcomeFeedback = mysqlTable(
  "outcomeFeedback",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Clerk organization identifier keeps analyst feedback inside the active workspace. */
    orgId: varchar("orgId", { length: 64 }).notNull(),
    transactionId: int("transactionId").notNull(),
    /** The model decision at the time of assessment; high risk is treated as a positive prediction. */
    predictedRiskLabel: mysqlEnum("predictedRiskLabel", [
      "low",
      "medium",
      "high",
    ]).notNull(),
    predictedProbability: int("predictedProbability").notNull(),
    /** Human-confirmed case result, never inferred automatically. */
    actualOutcome: mysqlEnum("actualOutcome", [
      "fraud",
      "legitimate",
    ]).notNull(),
    classification: mysqlEnum("classification", [
      "true_positive",
      "false_positive",
      "false_negative",
      "true_negative",
    ]).notNull(),
    resolutionReasonCode: varchar("resolutionReasonCode", { length: 64 }),
    recordedById: varchar("recordedById", { length: 64 }),
    recordedByName: varchar("recordedByName", { length: 160 }),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("outcome_feedback_org_transaction_unique").on(
      table.orgId,
      table.transactionId
    ),
  ]
);

export const apiKeys = mysqlTable(
  "apiKeys",
  {
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
  },
  table => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_org_created_idx").on(table.orgId, table.createdAt),
  ]
);

export const apiRequestLogs = mysqlTable(
  "apiRequestLogs",
  {
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
  },
  table => [
    index("api_request_logs_org_created_idx").on(table.orgId, table.createdAt),
    index("api_request_logs_key_created_idx").on(
      table.apiKeyId,
      table.createdAt
    ),
  ]
);

export const savedQueueViews = mysqlTable(
  "savedQueueViews",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Organization-scoped queue view ownership. */
    orgId: varchar("orgId", { length: 64 }).notNull(),
    ownerId: varchar("ownerId", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    visibility: mysqlEnum("visibility", ["private", "shared"])
      .default("private")
      .notNull(),
    filtersJson: varchar("filtersJson", { length: 2000 }).notNull(),
    createdByName: varchar("createdByName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("saved_queue_views_org_idx").on(table.orgId, table.updatedAt),
    uniqueIndex("saved_queue_views_org_owner_name_unique").on(
      table.orgId,
      table.ownerId,
      table.name
    ),
  ]
);

export const apiIdempotencyKeys = mysqlTable(
  "apiIdempotencyKeys",
  {
    id: int("id").autoincrement().primaryKey(),
    /** API-key-scoped replay protection; orgId is retained for tenant audits. */
    orgId: varchar("orgId", { length: 64 }).notNull(),
    apiKeyId: int("apiKeyId").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    requestHash: varchar("requestHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["processing", "completed"])
      .default("processing")
      .notNull(),
    responseStatus: int("responseStatus"),
    responseJson: text("responseJson"),
    transactionReference: varchar("transactionReference", { length: 32 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  table => [
    uniqueIndex("api_idempotency_key_unique").on(
      table.apiKeyId,
      table.idempotencyKey
    ),
    index("api_idempotency_org_created_idx").on(table.orgId, table.createdAt),
  ]
);

export const transactionImportBatches = mysqlTable(
  "transactionImportBatches",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: varchar("orgId", { length: 64 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["previewed", "completed", "failed"])
      .default("previewed")
      .notNull(),
    totalRows: int("totalRows").notNull(),
    readyRows: int("readyRows").notNull(),
    importedRows: int("importedRows").default(0).notNull(),
    invalidRows: int("invalidRows").default(0).notNull(),
    duplicateRows: int("duplicateRows").default(0).notNull(),
    errorsJson: text("errorsJson").notNull(),
    createdById: varchar("createdById", { length: 64 }),
    createdByName: varchar("createdByName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("transaction_import_batches_org_idx").on(
      table.orgId,
      table.createdAt
    ),
  ]
);

export const weeklySummaryPreferences = mysqlTable("weeklySummaryPreferences", {
  id: int("id").autoincrement().primaryKey(),
  /** Exactly one weekly-summary configuration is permitted per organization. */
  orgId: varchar("orgId", { length: 64 }).notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  /** Report recipient is kept separate from high-risk alert recipients. */
  toEmail: varchar("toEmail", { length: 320 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const weeklySummaryDeliveries = mysqlTable(
  "weeklySummaryDeliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    /** A successful weekly report is recorded once per organization and reporting period. */
    orgId: varchar("orgId", { length: 64 }).notNull(),
    periodStart: timestamp("periodStart").notNull(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    resendEmailId: varchar("resendEmailId", { length: 128 }),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("weekly_summary_deliveries_org_period_unique").on(
      table.orgId,
      table.periodStart
    ),
    index("weekly_summary_deliveries_org_sent_idx").on(
      table.orgId,
      table.sentAt
    ),
  ]
);

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
export type ModelRegistryVersion = typeof modelRegistryVersions.$inferSelect;
export type InsertModelRegistryVersion =
  typeof modelRegistryVersions.$inferInsert;
export type RiskPolicyVersion = typeof riskPolicyVersions.$inferSelect;
export type InsertRiskPolicyVersion = typeof riskPolicyVersions.$inferInsert;
export type RetentionPolicyVersion =
  typeof retentionPolicyVersions.$inferSelect;
export type InsertRetentionPolicyVersion =
  typeof retentionPolicyVersions.$inferInsert;
export type CaseChecklistItem = typeof caseChecklistItems.$inferSelect;
export type InsertCaseChecklistItem = typeof caseChecklistItems.$inferInsert;
export type RiskEntity = typeof riskEntities.$inferSelect;
export type InsertRiskEntity = typeof riskEntities.$inferInsert;
export type TransactionEntityLink = typeof transactionEntityLinks.$inferSelect;
export type InsertTransactionEntityLink =
  typeof transactionEntityLinks.$inferInsert;
export type NotificationPreferences =
  typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences =
  typeof notificationPreferences.$inferInsert;
export type OrganizationControls = typeof organizationControls.$inferSelect;
export type InsertOrganizationControls =
  typeof organizationControls.$inferInsert;
export type OutcomeFeedback = typeof outcomeFeedback.$inferSelect;
export type InsertOutcomeFeedback = typeof outcomeFeedback.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type ApiRequestLog = typeof apiRequestLogs.$inferSelect;
export type InsertApiRequestLog = typeof apiRequestLogs.$inferInsert;
export type TransactionImportBatch =
  typeof transactionImportBatches.$inferSelect;
export type InsertTransactionImportBatch =
  typeof transactionImportBatches.$inferInsert;
export type SavedQueueView = typeof savedQueueViews.$inferSelect;
export type InsertSavedQueueView = typeof savedQueueViews.$inferInsert;
export type ApiIdempotencyKey = typeof apiIdempotencyKeys.$inferSelect;
export type InsertApiIdempotencyKey = typeof apiIdempotencyKeys.$inferInsert;
export type WeeklySummaryPreferences =
  typeof weeklySummaryPreferences.$inferSelect;
export type InsertWeeklySummaryPreferences =
  typeof weeklySummaryPreferences.$inferInsert;
export type WeeklySummaryDelivery = typeof weeklySummaryDeliveries.$inferSelect;
export type InsertWeeklySummaryDelivery =
  typeof weeklySummaryDeliveries.$inferInsert;
