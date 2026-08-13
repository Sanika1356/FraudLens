import type { RiskRecord } from "./demoData";
import type { OutcomeFeedbackRecord } from "./db";

export type ReportRiskLevel = RiskRecord["riskLevel"];
export type ReportCaseStatus = RiskRecord["caseStatus"];

export type ReportFilters = {
  riskLevel?: ReportRiskLevel;
  caseStatus?: ReportCaseStatus;
  assigneeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type ReportRow = {
  reference: string;
  assessedAt: Date;
  merchant: string;
  category: string;
  amount: number;
  riskLevel: ReportRiskLevel;
  riskScore: number;
  caseStatus: ReportCaseStatus;
  priority: RiskRecord["casePriority"];
  assignee: string;
  assigneeId: string | null;
  dueAt: Date | null;
  resolutionReason: string | null;
  confirmedOutcome: "fraud" | "legitimate" | null;
  outcomeClassification: "true_positive" | "false_positive" | "false_negative" | "true_negative" | null;
};

export type OperationalReport = {
  generatedAt: Date;
  filters: ReportFilters;
  rows: ReportRow[];
  summary: {
    assessed: number;
    assessedAmount: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    openCases: number;
    resolvedCases: number;
    confirmedFraud: number;
    legitimate: number;
    overdueCases: number;
    reviewedOutcomes: number;
  };
  workload: {
    unassigned: number;
    investigators: Array<{ name: string; openCases: number; criticalCases: number; overdueCases: number }>;
  };
  resolutionReasons: Array<{ reason: string; count: number }>;
};

const REPORT_COLUMNS: Array<keyof Omit<ReportRow, "assessedAt" | "dueAt"> | "assessedAt" | "dueAt"> = [
  "reference",
  "assessedAt",
  "merchant",
  "category",
  "amount",
  "riskLevel",
  "riskScore",
  "caseStatus",
  "priority",
  "assignee",
  "dueAt",
  "resolutionReason",
  "confirmedOutcome",
  "outcomeClassification",
];

function matchesFilters(record: RiskRecord, filters: ReportFilters) {
  if (filters.riskLevel && record.riskLevel !== filters.riskLevel) return false;
  if (filters.caseStatus && record.caseStatus !== filters.caseStatus) return false;
  if (filters.assigneeId && record.assigneeId !== filters.assigneeId) return false;
  if (filters.dateFrom && record.createdAt < filters.dateFrom) return false;
  if (filters.dateTo && record.createdAt > filters.dateTo) return false;
  return true;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const spreadsheetSafeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(spreadsheetSafeText) ? `"${spreadsheetSafeText.replaceAll('"', '""')}"` : spreadsheetSafeText;
}

function dateStamp(value: Date | null) {
  return value ? value.toISOString() : "";
}

function readableStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function buildOperationalReport(
  records: RiskRecord[],
  feedback: OutcomeFeedbackRecord[],
  filters: ReportFilters = {},
  generatedAt = new Date(),
): OperationalReport {
  const feedbackByTransaction = new Map(feedback.map((item) => [item.transactionId, item]));
  const selected = records
    .filter((record) => matchesFilters(record, filters))
    .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());

  const rows = selected.map((record): ReportRow => {
    const outcome = feedbackByTransaction.get(record.id);
    return {
      reference: record.reference,
      assessedAt: record.createdAt,
      merchant: record.merchantName,
      category: record.merchantCategory,
      amount: record.amount,
      riskLevel: record.riskLevel,
      riskScore: record.probability,
      caseStatus: record.caseStatus,
      priority: record.casePriority,
      assignee: record.assigneeName ?? "Unassigned",
      assigneeId: record.assigneeId,
      dueAt: record.dueAt,
      resolutionReason: record.resolutionReasonCode,
      confirmedOutcome: outcome?.actualOutcome ?? null,
      outcomeClassification: outcome?.classification ?? null,
    };
  });

  const activeRows = selected.filter((record) => record.caseStatus === "under_review");
  const now = generatedAt.getTime();
  const workload = new Map<string, { name: string; openCases: number; criticalCases: number; overdueCases: number }>();
  for (const record of activeRows) {
    if (!record.assigneeId) continue;
    const current = workload.get(record.assigneeId) ?? { name: record.assigneeName ?? "Assigned investigator", openCases: 0, criticalCases: 0, overdueCases: 0 };
    current.openCases += 1;
    if (record.casePriority === "critical") current.criticalCases += 1;
    if (record.dueAt && record.dueAt.getTime() < now) current.overdueCases += 1;
    workload.set(record.assigneeId, current);
  }

  const resolutionReasons = new Map<string, number>();
  for (const row of rows) {
    if (!row.resolutionReason) continue;
    resolutionReasons.set(row.resolutionReason, (resolutionReasons.get(row.resolutionReason) ?? 0) + 1);
  }

  return {
    generatedAt,
    filters,
    rows,
    summary: {
      assessed: selected.length,
      assessedAmount: Math.round(selected.reduce((total, record) => total + record.amount, 0) * 100) / 100,
      highRisk: selected.filter((record) => record.riskLevel === "high").length,
      mediumRisk: selected.filter((record) => record.riskLevel === "medium").length,
      lowRisk: selected.filter((record) => record.riskLevel === "low").length,
      openCases: activeRows.length,
      resolvedCases: selected.filter((record) => record.caseStatus !== "under_review").length,
      confirmedFraud: selected.filter((record) => record.caseStatus === "confirmed_fraud").length,
      legitimate: selected.filter((record) => record.caseStatus === "legitimate").length,
      overdueCases: activeRows.filter((record) => record.dueAt && record.dueAt.getTime() < now).length,
      reviewedOutcomes: rows.filter((row) => row.confirmedOutcome !== null).length,
    },
    workload: {
      unassigned: activeRows.filter((record) => !record.assigneeId).length,
      investigators: Array.from(workload.values()).sort((first, second) => second.openCases - first.openCases || first.name.localeCompare(second.name)),
    },
    resolutionReasons: Array.from(resolutionReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((first, second) => second.count - first.count || first.reason.localeCompare(second.reason)),
  };
}

export function reportToCsv(report: OperationalReport) {
  const header = REPORT_COLUMNS.join(",");
  const rows = report.rows.map((row) => REPORT_COLUMNS.map((column) => {
    const value = column === "assessedAt" ? dateStamp(row.assessedAt) : column === "dueAt" ? dateStamp(row.dueAt) : row[column];
    return csvCell(value);
  }).join(","));
  return `${header}\n${rows.join("\n")}\n`;
}

export function reportToText(report: OperationalReport) {
  const { summary, workload, resolutionReasons } = report;
  const period = [report.filters.dateFrom?.toISOString().slice(0, 10), report.filters.dateTo?.toISOString().slice(0, 10)].filter(Boolean).join(" to ") || "All available activity";
  const reasonLines = resolutionReasons.length
    ? resolutionReasons.map((item) => `- ${readableStatus(item.reason)}: ${item.count}`).join("\n")
    : "- No resolved cases in the selected activity.";
  const investigatorLines = workload.investigators.length
    ? workload.investigators.map((item) => `- ${item.name}: ${item.openCases} open, ${item.criticalCases} critical, ${item.overdueCases} overdue`).join("\n")
    : "- No assigned active cases in the selected activity.";

  return [
    "FraudLens operational report",
    `Generated: ${report.generatedAt.toISOString()}`,
    `Activity period: ${period}`,
    "",
    "Portfolio summary",
    `- Assessed transactions: ${summary.assessed}`,
    `- Assessed amount: $${summary.assessedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- High-risk assessments: ${summary.highRisk}`,
    `- Medium-risk assessments: ${summary.mediumRisk}`,
    `- Low-risk assessments: ${summary.lowRisk}`,
    `- Open cases: ${summary.openCases}`,
    `- Resolved cases: ${summary.resolvedCases}`,
    `- Confirmed fraud: ${summary.confirmedFraud}`,
    `- Confirmed legitimate: ${summary.legitimate}`,
    `- Overdue cases: ${summary.overdueCases}`,
    `- Human-confirmed outcomes: ${summary.reviewedOutcomes}`,
    "",
    "Resolution reasons",
    reasonLines,
    "",
    `Workload (${workload.unassigned} unassigned active case${workload.unassigned === 1 ? "" : "s"})`,
    investigatorLines,
    "",
    "Notes",
    "- Report filters apply to assessed transaction activity in this workspace.",
    "- Outcome counts reflect investigator-confirmed case results associated with the selected records.",
  ].join("\n");
}

export function reportFileName(extension: "csv" | "txt", generatedAt = new Date()) {
  return `fraudlens-operational-report-${generatedAt.toISOString().slice(0, 10)}.${extension}`;
}

export const reportFilterSchemaDescription = "Filters apply to transaction assessments created within the selected reporting period.";
