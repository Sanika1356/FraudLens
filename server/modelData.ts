export const modelHealth = {
  datasetLabel:
    "OpenML 42175 anonymized credit-card benchmark — sampled evaluation",
  datasetSource: "https://www.openml.org/d/42175",
  modelLabel:
    "Logistic regression baseline with robust scaling, balanced classes, and validation-calibrated threshold",
  modelVersion: "fraudlens-lr-0.2",
  sampleRows: 120000,
  positiveRows: 247,
  threshold: 0.95,
  precision: 0.398,
  recall: 0.823,
  f1Score: 0.537,
  prAuc: 0.607,
  confusionMatrix: {
    trueNegative: 29861,
    falsePositive: 77,
    falseNegative: 11,
    truePositive: 51,
  },
  limitations:
    "Evaluation metrics are from an anonymized public benchmark. FraudLens manual assessments use a transparent demonstration risk policy because the benchmark does not expose merchant, country, or device features.",
  evaluatedAt: new Date("2026-08-12T17:08:00.000Z"),
} as const;
