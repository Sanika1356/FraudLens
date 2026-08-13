import { describe, expect, it } from "vitest";
import { demoTransactions } from "./demoData";
import { parseCsvImport } from "./csvImport";
import { decodeAndValidateEvidenceAttachment } from "./evidenceFiles";
import { createEvidenceStorageKey } from "./storage";
import { applyCaseUpdate, applyCaseWorkflowUpdate, caseUpdateSchema, caseWorkflowUpdateSchema, notificationPreferencesSchema, reportFiltersSchema, riskInputSchema, weeklySummaryPreferencesSchema } from "./routers";
import { shouldSendHighRiskAlert } from "./notifications";
import { buildModelQualityReport, classifyOutcome } from "./outcomeFeedback";
import { buildOperationalReport, reportToCsv, reportToText } from "./reports";
import { PUBLIC_API_KEY_SCOPE, apiKeysMatch, createApiKeySecret, extractBearerApiKey, isApiKeyActive, parseApiKeyScopes } from "./apiKeys";
import { previousWeekWindow } from "./weeklySummaries";

describe("FraudLens workflow validation", () => {
  it("rejects unsafe manual assessment inputs before scoring", () => {
    const invalid = riskInputSchema.safeParse({
      amount: 0,
      merchantCategory: "x",
      transactionCountry: "usa1",
      accountCountry: "",
      deviceStatus: "new",
      transactionHour: 24,
      recentTransactionCount: 51,
    });

    expect(invalid.success).toBe(false);
  });

  it("rejects a case outcome without a meaningful investigator note", () => {
    const invalid = caseUpdateSchema.safeParse({
      id: 7,
      caseStatus: "confirmed_fraud",
      note: "  ",
    });

    expect(invalid.success).toBe(false);
  });

  it("rejects malformed assignment workflow updates", () => {
    const invalid = caseWorkflowUpdateSchema.safeParse({
      id: 7,
      assigneeId: " ",
      casePriority: "urgent",
      dueAt: null,
    });

    expect(invalid.success).toBe(false);
  });

  it("records a validated case transition, trims its note, and clears new-alert state", () => {
    const source = demoTransactions[0];
    if (!source) throw new Error("Expected demo transaction");
    const record = { ...source, isNew: true, caseStatus: "under_review" as const, caseNote: null };
    const parsed = caseUpdateSchema.parse({
      id: record.id,
      caseStatus: "legitimate",
      note: "  Verified against the account holder.  ",
      resolutionReasonCode: "customer_verified",
    });

    const updated = applyCaseUpdate(record, parsed);

    expect(updated.caseStatus).toBe("legitimate");
    expect(updated.caseNote).toBe("Verified against the account holder.");
    expect(updated.resolutionReasonCode).toBe("customer_verified");
    expect(updated.isNew).toBe(false);
  });

  it("accepts only defined resolution reason codes", () => {
    expect(caseUpdateSchema.safeParse({ id: 7, caseStatus: "confirmed_fraud", note: "Validated fraud outcome.", resolutionReasonCode: "pattern_match" }).success).toBe(true);
    expect(caseUpdateSchema.safeParse({ id: 7, caseStatus: "confirmed_fraud", note: "Validated fraud outcome.", resolutionReasonCode: "unverified" }).success).toBe(false);
  });

  it("sets ownership, priority, and a due date for an active case", () => {
    const source = demoTransactions[0];
    if (!source) throw new Error("Expected demo transaction");
    const record = { ...source, assigneeId: null, assigneeName: null, casePriority: "standard" as const, dueAt: null };
    const dueAt = new Date("2026-08-18T17:00:00.000Z");
    const parsed = caseWorkflowUpdateSchema.parse({ id: record.id, assigneeId: "user_analyst_42", casePriority: "critical", dueAt });

    const updated = applyCaseWorkflowUpdate(record, parsed, "Alex Analyst");

    expect(updated).toMatchObject({ assigneeId: "user_analyst_42", assigneeName: "Alex Analyst", casePriority: "critical" });
    expect(updated.dueAt?.toISOString()).toBe(dueAt.toISOString());
  });

  it("parses valid CSV rows and reports malformed row fields without discarding valid rows", () => {
    const parsed = parseCsvImport([
      "reference,amount,merchantCategory,transactionCountry,accountCountry,deviceStatus,transactionHour,recentTransactionCount",
      "FRAUD-CSV-001,279.99,electronics,US,US,new,2,4",
      "FRAUD-CSV-002,not-a-number,electronics,US,US,unknown,29,55",
    ].join("\n"));

    expect(parsed.totalRows).toBe(2);
    expect(parsed.candidates).toEqual([expect.objectContaining({ row: 2, reference: "FRAUD-CSV-001", input: expect.objectContaining({ amount: 279.99, deviceStatus: "new" }) })]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, field: "amount" }),
      expect.objectContaining({ row: 3, field: "deviceStatus" }),
      expect.objectContaining({ row: 3, field: "transactionHour" }),
    ]));
  });

  it("accepts permitted evidence formats and rejects content or extension spoofing", () => {
    const pdf = Buffer.from("%PDF-1.7\nEvidence document", "utf8").toString("base64");
    const valid = decodeAndValidateEvidenceAttachment({ fileName: "review.pdf", mimeType: "application/pdf", contentBase64: pdf });

    expect(valid.toString("utf8")).toContain("%PDF-1.7");
    expect(() => decodeAndValidateEvidenceAttachment({ fileName: "review.pdf", mimeType: "image/png", contentBase64: pdf })).toThrow("extension does not match");
    expect(() => decodeAndValidateEvidenceAttachment({ fileName: "review.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("not a PDF").toString("base64") })).toThrow("valid PDF header");
    expect(() => decodeAndValidateEvidenceAttachment({ fileName: "notes.txt", mimeType: "text/plain", contentBase64: Buffer.from([0x61, 0x00, 0x62]).toString("base64") })).toThrow("null bytes");
  });

  it("creates segregated evidence keys without trusting caller file paths", () => {
    expect(createEvidenceStorageKey("org_alpha", 42, "merchant invoice.pdf")).toMatch(/^evidence\/org_alpha\/42\/merchant-invoice\.pdf$/);
    expect(createEvidenceStorageKey("org_beta", 42, "merchant invoice.pdf")).not.toContain("org_alpha");
  });

  it("evaluates high-risk alerts at and above the configured threshold only", () => {
    expect(shouldSendHighRiskAlert(80, 80)).toBe(true);
    expect(shouldSendHighRiskAlert(81, 80)).toBe(true);
    expect(shouldSendHighRiskAlert(79, 80)).toBe(false);
    expect(shouldSendHighRiskAlert(Number.NaN, 80)).toBe(false);
  });

  it("creates non-recoverable API-key material and accepts only a valid bearer credential", () => {
    const first = createApiKeySecret();
    const second = createApiKeySecret();

    expect(first.secret).toMatch(/^fl_live_[A-Za-z0-9_-]{32,128}$/);
    expect(first.keyPrefix).toContain("…");
    expect(first.keyHash).not.toContain(first.secret);
    expect(first.keyHash).not.toBe(second.keyHash);
    expect(apiKeysMatch(first.secret, first.secret)).toBe(true);
    expect(apiKeysMatch(first.secret, second.secret)).toBe(false);
    expect(extractBearerApiKey(`Bearer ${first.secret}`)).toBe(first.secret);
    expect(extractBearerApiKey(`bearer ${first.secret}`)).toBe(first.secret);
    expect(extractBearerApiKey("Bearer not-an-api-key")).toBeNull();
    expect(extractBearerApiKey(`Basic ${first.secret}`)).toBeNull();
  });

  it("restricts public API keys to transaction submission and rejects revoked or expired keys", () => {
    expect(parseApiKeyScopes(JSON.stringify([PUBLIC_API_KEY_SCOPE, "admin:all"]))).toEqual([PUBLIC_API_KEY_SCOPE]);
    expect(parseApiKeyScopes("not-json")).toEqual([]);
    const now = new Date("2026-08-13T12:00:00.000Z");
    expect(isApiKeyActive(null, null, now)).toBe(true);
    expect(isApiKeyActive(null, new Date("2026-08-13T12:01:00.000Z"), now)).toBe(true);
    expect(isApiKeyActive(null, new Date("2026-08-13T11:59:00.000Z"), now)).toBe(false);
    expect(isApiKeyActive(new Date("2026-08-13T11:00:00.000Z"), null, now)).toBe(false);
  });

  it("requires valid configured destinations before alert channels can be enabled", () => {
    const missingEmail = notificationPreferencesSchema.safeParse({
      emailEnabled: true, toEmail: null, slackEnabled: false, slackWebhookUrl: null, teamsEnabled: false, teamsWebhookUrl: null, riskThreshold: 80,
    });
    const unsafeSlack = notificationPreferencesSchema.safeParse({
      emailEnabled: false, toEmail: null, slackEnabled: true, slackWebhookUrl: "https://example.com/webhook", teamsEnabled: false, teamsWebhookUrl: null, riskThreshold: 80,
    });
    const valid = notificationPreferencesSchema.safeParse({
      emailEnabled: true, toEmail: "fraud-operations@example.com", slackEnabled: true, slackWebhookUrl: "https://hooks.slack.com/services/T123/B123/secret", teamsEnabled: true, teamsWebhookUrl: "https://prod-01.westus.logic.azure.com/workflows/test/triggers/manual/paths/invoke", riskThreshold: 80,
    });

    expect(missingEmail.success).toBe(false);
    expect(unsafeSlack.success).toBe(false);
    expect(valid.success).toBe(true);
  });

  it("requires a valid recipient before enabling automatic weekly summaries", () => {
    const missingRecipient = weeklySummaryPreferencesSchema.safeParse({ enabled: true, toEmail: null });
    const invalidRecipient = weeklySummaryPreferencesSchema.safeParse({ enabled: true, toEmail: "not-an-email" });
    const disabledWithoutRecipient = weeklySummaryPreferencesSchema.safeParse({ enabled: false, toEmail: null });
    const enabledWithRecipient = weeklySummaryPreferencesSchema.safeParse({ enabled: true, toEmail: "fraud-operations@example.com" });

    expect(missingRecipient.success).toBe(false);
    expect(invalidRecipient.success).toBe(false);
    expect(disabledWithoutRecipient.success).toBe(true);
    expect(enabledWithRecipient.success).toBe(true);
  });

  it("selects the complete previous Monday-to-Sunday reporting period in UTC", () => {
    const window = previousWeekWindow(new Date("2026-08-17T15:30:00.000Z"));

    expect(window.periodStart.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(window.periodEnd.toISOString()).toBe("2026-08-16T23:59:59.999Z");
  });

  it("classifies confirmed case outcomes against the high-risk model decision boundary", () => {
    expect(classifyOutcome("high", "fraud")).toBe("true_positive");
    expect(classifyOutcome("high", "legitimate")).toBe("false_positive");
    expect(classifyOutcome("medium", "fraud")).toBe("false_negative");
    expect(classifyOutcome("low", "legitimate")).toBe("true_negative");
  });

  it("derives organization quality metrics only from confirmed outcomes", () => {
    const report = buildModelQualityReport([
      { predictedRiskLabel: "high", actualOutcome: "fraud", classification: "true_positive", recordedAt: new Date("2026-08-11T10:00:00.000Z") },
      { predictedRiskLabel: "high", actualOutcome: "fraud", classification: "true_positive", recordedAt: new Date("2026-08-11T11:00:00.000Z") },
      { predictedRiskLabel: "high", actualOutcome: "legitimate", classification: "false_positive", recordedAt: new Date("2026-08-12T10:00:00.000Z") },
      { predictedRiskLabel: "medium", actualOutcome: "fraud", classification: "false_negative", recordedAt: new Date("2026-08-12T11:00:00.000Z") },
      { predictedRiskLabel: "low", actualOutcome: "legitimate", classification: "true_negative", recordedAt: new Date("2026-08-12T12:00:00.000Z") },
    ]);

    expect(report).toMatchObject({
      reviewed: 5,
      confirmedFraud: 3,
      legitimate: 2,
      precisionMilli: 667,
      recallMilli: 667,
      f1Milli: 667,
      accuracyMilli: 600,
      confusionMatrix: { truePositive: 2, falsePositive: 1, falseNegative: 1, trueNegative: 1 },
    });
    expect(report.trend).toEqual(expect.arrayContaining([
      expect.objectContaining({ day: "2026-08-11", reviewed: 2, confirmedFraud: 2 }),
      expect.objectContaining({ day: "2026-08-12", reviewed: 3, falsePositive: 1, falseNegative: 1 }),
    ]));
  });

  it("reports unavailable rates when no confirmed outcomes exist", () => {
    const report = buildModelQualityReport([]);
    expect(report).toMatchObject({ reviewed: 0, precisionMilli: null, recallMilli: null, f1Milli: null, accuracyMilli: null });
  });

  it("derives filtered operational metrics, analyst workload, and downloadable report content", () => {
    const first = demoTransactions[0];
    const second = demoTransactions[1];
    if (!first || !second) throw new Error("Expected demo records");
    const records = [
      { ...first, createdAt: new Date("2026-08-12T09:00:00.000Z"), riskLevel: "high" as const, caseStatus: "under_review" as const, assigneeId: "user_a", assigneeName: "Alex Analyst", casePriority: "critical" as const, dueAt: new Date("2026-08-12T12:00:00.000Z") },
      { ...second, createdAt: new Date("2026-08-11T09:00:00.000Z"), riskLevel: "low" as const, caseStatus: "legitimate" as const, assigneeId: null, assigneeName: null, casePriority: "standard" as const, dueAt: null, resolutionReasonCode: "customer_verified" },
    ];

    const report = buildOperationalReport(records, [], { dateFrom: new Date("2026-08-12T00:00:00.000Z"), dateTo: new Date("2026-08-12T23:59:59.000Z") }, new Date("2026-08-13T10:00:00.000Z"));

    expect(report.summary).toMatchObject({ assessed: 1, highRisk: 1, openCases: 1, resolvedCases: 0, overdueCases: 1, assessedAmount: first.amount });
    expect(report.workload).toEqual({ unassigned: 0, investigators: [{ name: "Alex Analyst", openCases: 1, criticalCases: 1, overdueCases: 1 }] });
    expect(report.rows).toHaveLength(1);
    expect(reportToCsv(report)).toContain(`reference,assessedAt,merchant`);
    expect(reportToText(report)).toContain("FraudLens operational report");
  });

  it("neutralizes spreadsheet formulas in CSV report fields", () => {
    const first = demoTransactions[0];
    if (!first) throw new Error("Expected demo record");
    const report = buildOperationalReport([{ ...first, merchantName: "=HYPERLINK(\"https://unsafe.example\")" }], [], {});

    expect(reportToCsv(report)).toContain("'=HYPERLINK");
    expect(reportToCsv(report)).not.toContain(",=HYPERLINK");
  });

  it("validates reporting date ranges before generating exports", () => {
    expect(reportFiltersSchema.safeParse({ dateFrom: new Date("2026-08-13"), dateTo: new Date("2026-08-12") }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ riskLevel: "high", caseStatus: "under_review" }).success).toBe(true);
  });

  it("reports required headers and malformed quoted CSV data precisely", () => {
    const missingHeader = parseCsvImport("reference,amount\nFRAUD-CSV-003,20");
    const unclosedQuote = parseCsvImport("reference,amount,merchantCategory,transactionCountry,accountCountry,deviceStatus,transactionHour,recentTransactionCount\n\"FRAUD-CSV-004,20");

    expect(missingHeader.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, field: "merchantCategory" })]));
    expect(unclosedQuote.errors).toEqual([expect.objectContaining({ row: 1, field: "file", message: "The CSV contains an unclosed quoted value." })]);
  });
});
