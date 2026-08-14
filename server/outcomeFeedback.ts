import type { RiskLevel } from "./riskEngine";

export const ACTUAL_OUTCOMES = ["fraud", "legitimate"] as const;
export const OUTCOME_CLASSIFICATIONS = [
  "true_positive",
  "false_positive",
  "false_negative",
  "true_negative",
] as const;

export type ActualOutcome = (typeof ACTUAL_OUTCOMES)[number];
export type OutcomeClassification = (typeof OUTCOME_CLASSIFICATIONS)[number];

export type OutcomeFeedbackMetric = {
  predictedRiskLabel: RiskLevel;
  actualOutcome: ActualOutcome;
  classification: OutcomeClassification;
  recordedAt: Date;
};

export function classifyOutcome(
  predictedRiskLabel: RiskLevel,
  actualOutcome: ActualOutcome
): OutcomeClassification {
  const predictedFraud = predictedRiskLabel === "high";
  if (predictedFraud && actualOutcome === "fraud") return "true_positive";
  if (predictedFraud && actualOutcome === "legitimate") return "false_positive";
  if (!predictedFraud && actualOutcome === "fraud") return "false_negative";
  return "true_negative";
}

function ratioMilli(numerator: number, denominator: number) {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 1000);
}

function percentageMilli(numerator: number, denominator: number) {
  return ratioMilli(numerator, denominator);
}

function formatDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildModelQualityReport(feedback: OutcomeFeedbackMetric[]) {
  const counts = {
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
  };

  for (const outcome of feedback) {
    if (outcome.classification === "true_positive") counts.truePositive += 1;
    if (outcome.classification === "false_positive") counts.falsePositive += 1;
    if (outcome.classification === "false_negative") counts.falseNegative += 1;
    if (outcome.classification === "true_negative") counts.trueNegative += 1;
  }

  const reviewed = feedback.length;
  const confirmedFraud = counts.truePositive + counts.falseNegative;
  const legitimate = counts.falsePositive + counts.trueNegative;
  const precisionMilli = ratioMilli(
    counts.truePositive,
    counts.truePositive + counts.falsePositive
  );
  const recallMilli = ratioMilli(
    counts.truePositive,
    counts.truePositive + counts.falseNegative
  );
  const f1Milli =
    precisionMilli === null ||
    recallMilli === null ||
    precisionMilli + recallMilli === 0
      ? null
      : Math.round(
          (2 * precisionMilli * recallMilli) / (precisionMilli + recallMilli)
        );
  const accuracyMilli = percentageMilli(
    counts.truePositive + counts.trueNegative,
    reviewed
  );

  const trendByDay = new Map<string, OutcomeFeedbackMetric[]>();
  for (const outcome of feedback) {
    const day = formatDay(outcome.recordedAt);
    const values = trendByDay.get(day) ?? [];
    values.push(outcome);
    trendByDay.set(day, values);
  }

  const trend = Array.from(trendByDay.entries())
    .map(([day, values]) => {
      const dayCounts = values.reduce(
        (result, value) => {
          result[value.classification] += 1;
          return result;
        },
        {
          true_positive: 0,
          false_positive: 0,
          false_negative: 0,
          true_negative: 0,
        }
      );
      const dayReviewed = values.length;
      return {
        day,
        reviewed: dayReviewed,
        confirmedFraud: dayCounts.true_positive + dayCounts.false_negative,
        legitimate: dayCounts.false_positive + dayCounts.true_negative,
        falsePositive: dayCounts.false_positive,
        falseNegative: dayCounts.false_negative,
        accuracyMilli: percentageMilli(
          dayCounts.true_positive + dayCounts.true_negative,
          dayReviewed
        ),
      };
    })
    .sort((first, second) => first.day.localeCompare(second.day))
    .slice(-30);

  return {
    reviewed,
    confirmedFraud,
    legitimate,
    precisionMilli,
    recallMilli,
    f1Milli,
    accuracyMilli,
    confusionMatrix: counts,
    trend,
  };
}

export function milliToPercent(value: number | null) {
  return value === null ? null : value / 10;
}
