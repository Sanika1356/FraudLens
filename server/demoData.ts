import { CaseStatus, RiskInput, scoreTransaction } from "./riskEngine";

export type RiskRecord = RiskInput & {
  id: number;
  reference: string;
  merchantName: string;
  createdAt: Date;
  caseStatus: CaseStatus;
  caseNote: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  casePriority: "critical" | "high" | "standard";
  dueAt: Date | null;
  isNew: boolean;
  llmSummary: string | null;
  llmNextStep: string | null;
  riskLevel: ReturnType<typeof scoreTransaction>["riskLevel"];
  probability: number;
  factors: ReturnType<typeof scoreTransaction>["factors"];
  deterministicExplanation: string;
};

const definitions: Array<Omit<RiskRecord, "riskLevel" | "probability" | "factors" | "deterministicExplanation" | "llmSummary" | "llmNextStep">> = [
  { id: 1001, reference: "FRD-8Q2M91", merchantName: "Sora Travel", amount: 2940, merchantCategory: "travel", transactionCountry: "SG", accountCountry: "US", deviceStatus: "new", transactionHour: 1, recentTransactionCount: 6, createdAt: new Date("2026-08-12T09:12:00.000Z"), caseStatus: "under_review", caseNote: null, assigneeId: null, assigneeName: null, casePriority: "critical", dueAt: new Date("2026-08-13T13:00:00.000Z"), isNew: true },
  { id: 1002, reference: "FRD-71AP34", merchantName: "Northstar Electronics", amount: 1285, merchantCategory: "electronics", transactionCountry: "US", accountCountry: "US", deviceStatus: "new", transactionHour: 23, recentTransactionCount: 4, createdAt: new Date("2026-08-12T08:42:00.000Z"), caseStatus: "under_review", caseNote: "Device fingerprint requires confirmation.", assigneeId: null, assigneeName: null, casePriority: "high", dueAt: new Date("2026-08-14T17:00:00.000Z"), isNew: true },
  { id: 1003, reference: "FRD-4TRW18", merchantName: "Atelier Luma", amount: 864, merchantCategory: "jewelry", transactionCountry: "FR", accountCountry: "GB", deviceStatus: "known", transactionHour: 15, recentTransactionCount: 1, createdAt: new Date("2026-08-12T07:30:00.000Z"), caseStatus: "confirmed_fraud", caseNote: "Customer dispute received; case confirmed.", assigneeId: null, assigneeName: null, casePriority: "high", dueAt: null, isNew: false },
  { id: 1004, reference: "FRD-2BCM73", merchantName: "Daylight Market", amount: 118, merchantCategory: "groceries", transactionCountry: "US", accountCountry: "US", deviceStatus: "known", transactionHour: 16, recentTransactionCount: 1, createdAt: new Date("2026-08-12T06:18:00.000Z"), caseStatus: "legitimate", caseNote: "Customer verified purchase.", assigneeId: null, assigneeName: null, casePriority: "standard", dueAt: null, isNew: false },
  { id: 1005, reference: "FRD-90NX15", merchantName: "Pixel Vault", amount: 642, merchantCategory: "digital goods", transactionCountry: "CA", accountCountry: "CA", deviceStatus: "new", transactionHour: 3, recentTransactionCount: 2, createdAt: new Date("2026-08-11T22:12:00.000Z"), caseStatus: "under_review", caseNote: null, assigneeId: null, assigneeName: null, casePriority: "standard", dueAt: new Date("2026-08-15T17:00:00.000Z"), isNew: false },
  { id: 1006, reference: "FRD-63DL90", merchantName: "Cedar Books", amount: 52, merchantCategory: "books", transactionCountry: "US", accountCountry: "US", deviceStatus: "known", transactionHour: 11, recentTransactionCount: 0, createdAt: new Date("2026-08-11T20:01:00.000Z"), caseStatus: "legitimate", caseNote: "Low-risk pattern retained for evaluation coverage.", assigneeId: null, assigneeName: null, casePriority: "standard", dueAt: null, isNew: false },
  { id: 1007, reference: "FRD-58KP42", merchantName: "Arcade Works", amount: 385, merchantCategory: "digital goods", transactionCountry: "DE", accountCountry: "US", deviceStatus: "new", transactionHour: 4, recentTransactionCount: 5, createdAt: new Date("2026-08-11T18:48:00.000Z"), caseStatus: "confirmed_fraud", caseNote: "Pattern matched a prior confirmed sequence.", assigneeId: null, assigneeName: null, casePriority: "high", dueAt: null, isNew: false },
  { id: 1008, reference: "FRD-15VT66", merchantName: "Metro Fuel", amount: 78, merchantCategory: "fuel", transactionCountry: "US", accountCountry: "US", deviceStatus: "known", transactionHour: 8, recentTransactionCount: 1, createdAt: new Date("2026-08-11T16:20:00.000Z"), caseStatus: "legitimate", caseNote: null, assigneeId: null, assigneeName: null, casePriority: "standard", dueAt: null, isNew: false },
];

export const demoTransactions: RiskRecord[] = definitions.map((definition) => {
  const decision = scoreTransaction(definition);
  return { ...definition, ...decision, llmSummary: null, llmNextStep: null };
});

export const driftDemo = [
  { feature: "Transaction amount", baseline: "$184 median", recent: "$238 median", changePercent: 29, status: "watch" as const, description: "Recent assessed amounts are above the training reference range." },
  { feature: "New device rate", baseline: "18%", recent: "24%", changePercent: 33, status: "elevated" as const, description: "A larger share of transactions are arriving from new devices." },
  { feature: "Cross-border rate", baseline: "11%", recent: "12%", changePercent: 9, status: "stable" as const, description: "Cross-border activity remains close to the baseline." },
  { feature: "Night-time activity", baseline: "7%", recent: "10%", changePercent: 43, status: "elevated" as const, description: "Overnight activity has increased and warrants monitoring." },
];
