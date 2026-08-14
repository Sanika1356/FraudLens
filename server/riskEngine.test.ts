import { describe, expect, it } from "vitest";
import { fallbackSummary, scoreTransaction } from "./riskEngine";

describe("scoreTransaction", () => {
  it("classifies a routine known-device payment as low risk", () => {
    const decision = scoreTransaction({
      amount: 42,
      merchantCategory: "groceries",
      transactionCountry: "US",
      accountCountry: "US",
      deviceStatus: "known",
      transactionHour: 14,
      recentTransactionCount: 0,
    });

    expect(decision.riskLevel).toBe("low");
    expect(decision.probability).toBe(8);
    expect(decision.deterministicExplanation).toContain(
      "Human review should confirm"
    );
  });

  it("surfaces explainable leading factors for a high-risk event", () => {
    const decision = scoreTransaction({
      amount: 2400,
      merchantCategory: "electronics",
      transactionCountry: "GB",
      accountCountry: "US",
      deviceStatus: "new",
      transactionHour: 1,
      recentTransactionCount: 7,
    });

    expect(decision.riskLevel).toBe("high");
    expect(decision.probability).toBeGreaterThanOrEqual(70);
    expect(decision.factors.map(factor => factor.key)).toEqual(
      expect.arrayContaining([
        "high_amount",
        "new_device",
        "country_mismatch",
        "velocity_high",
      ])
    );
  });

  it("returns a plain-English safe fallback next step", () => {
    const decision = scoreTransaction({
      amount: 1000,
      merchantCategory: "travel",
      transactionCountry: "US",
      accountCountry: "US",
      deviceStatus: "known",
      transactionHour: 13,
      recentTransactionCount: 3,
    });
    const summary = fallbackSummary(decision);

    expect(decision.riskLevel).toBe("medium");
    expect(summary.summary).toBe(decision.deterministicExplanation);
    expect(summary.nextStep).toContain("Review the transaction");
  });
});
