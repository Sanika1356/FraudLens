import { describe, expect, it } from "vitest";
import { demoTransactions } from "./demoData";
import { applyCaseUpdate, caseUpdateSchema, riskInputSchema } from "./routers";

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

  it("records a validated case transition, trims its note, and clears new-alert state", () => {
    const source = demoTransactions[0];
    if (!source) throw new Error("Expected demo transaction");
    const record = { ...source, isNew: true, caseStatus: "under_review" as const, caseNote: null };
    const parsed = caseUpdateSchema.parse({
      id: record.id,
      caseStatus: "legitimate",
      note: "  Verified against the account holder.  ",
    });

    const updated = applyCaseUpdate(record, parsed);

    expect(updated.caseStatus).toBe("legitimate");
    expect(updated.caseNote).toBe("Verified against the account holder.");
    expect(updated.isNew).toBe(false);
  });
});
