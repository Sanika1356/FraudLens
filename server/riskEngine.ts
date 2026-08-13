export const RISK_LEVELS = ["low", "medium", "high"] as const;
export const CASE_STATUSES = ["under_review", "confirmed_fraud", "legitimate"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type DeviceStatus = "known" | "new";

export type RiskInput = {
  amount: number;
  merchantCategory: string;
  transactionCountry: string;
  accountCountry: string;
  deviceStatus: DeviceStatus;
  transactionHour: number;
  recentTransactionCount: number;
};

export type RiskFactor = {
  key: string;
  label: string;
  impact: "low" | "medium" | "high";
  detail: string;
};

export type RiskDecision = {
  riskLevel: RiskLevel;
  probability: number;
  factors: RiskFactor[];
  deterministicExplanation: string;
};

const elevatedCategories = new Set(["electronics", "jewelry", "travel", "digital goods", "luxury"]);

function factor(key: string, label: string, impact: RiskFactor["impact"], detail: string) {
  return { key, label, impact, detail };
}

export function scoreTransaction(input: RiskInput): RiskDecision {
  let score = 8;
  const factors: RiskFactor[] = [];
  const normalisedCategory = input.merchantCategory.trim().toLowerCase();

  if (input.amount >= 1500) {
    score += 31;
    factors.push(factor("high_amount", "Unusually high amount", "high", "The amount is much higher than a routine card payment."));
  } else if (input.amount >= 750) {
    score += 19;
    factors.push(factor("elevated_amount", "Elevated transaction amount", "medium", "The amount is larger than a typical everyday purchase."));
  } else if (input.amount >= 300) {
    score += 9;
    factors.push(factor("moderate_amount", "Above-usual amount", "low", "The amount is above the low-risk reference range."));
  }

  if (input.deviceStatus === "new") {
    score += 18;
    factors.push(factor("new_device", "New device", "high", "The transaction was initiated from a device not previously recognised."));
  }

  if (input.transactionCountry !== input.accountCountry) {
    score += 16;
    factors.push(factor("country_mismatch", "Country mismatch", "high", "The transaction country differs from the account’s reference country."));
  }

  if (input.recentTransactionCount >= 5) {
    score += 16;
    factors.push(factor("velocity_high", "Unusual transaction velocity", "high", "Several transactions were recorded within a short review window."));
  } else if (input.recentTransactionCount >= 3) {
    score += 8;
    factors.push(factor("velocity_watch", "Elevated transaction velocity", "medium", "More recent transactions were observed than expected for a routine pattern."));
  }

  if (input.transactionHour <= 5 || input.transactionHour >= 23) {
    score += 8;
    factors.push(factor("late_hour", "Unusual transaction time", "medium", "The transaction occurred during a lower-activity overnight period."));
  }

  if (elevatedCategories.has(normalisedCategory)) {
    score += 6;
    factors.push(factor("category_context", "Higher-risk merchant context", "low", "This merchant category receives additional review attention in the demonstration policy."));
  }

  const probability = Math.min(96, Math.max(4, Math.round(score)));
  const riskLevel: RiskLevel = probability >= 70 ? "high" : probability >= 35 ? "medium" : "low";
  const leadingFactors = factors.slice(0, 3).map(item => item.label.toLowerCase());
  const reason = leadingFactors.length > 0 ? leadingFactors.join(", ") : "no strong risk indicators";
  const deterministicExplanation = `This transaction is assessed as ${riskLevel} risk at ${probability}% because of ${reason}. Human review should confirm the outcome before any action is taken.`;

  return { riskLevel, probability, factors, deterministicExplanation };
}

export function fallbackSummary(decision: RiskDecision) {
  const nextStep = decision.riskLevel === "high"
    ? "Open the case, verify the payment context, and contact the account holder through an approved channel if policy requires it."
    : decision.riskLevel === "medium"
      ? "Review the transaction alongside recent activity and retain it for follow-up if further risk signals appear."
      : "No urgent action is indicated; retain the assessment in the normal review record.";
  return { summary: decision.deterministicExplanation, nextStep };
}
