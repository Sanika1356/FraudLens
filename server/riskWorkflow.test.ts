import { describe, expect, it } from "vitest";
import { demoTransactions } from "./demoData";
import { applyCaseUpdate, applyCaseWorkflowUpdate, caseUpdateSchema, caseWorkflowUpdateSchema, riskInputSchema } from "./routers";

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
});
