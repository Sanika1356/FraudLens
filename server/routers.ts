import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { organizationAdministratorProcedure, organizationManagerProcedure, organizationProcedure, publicProcedure, router } from "./_core/trpc";
import {
  FRAUDLENS_ROLES,
  ORGANIZATION_MEMBERSHIP_ROLES,
  changeFraudLensRole,
  changeOrganizationMembershipRole,
  deactivateOrganizationMember,
  getWorkspaceDirectory,
  inviteOrganizationMember,
  revokeMemberSessions,
  revokeOrganizationInvitation,
} from "./adminManagement";
import { getDb, persistTransaction } from "./db";
import { demoTransactions, driftDemo, RiskRecord } from "./demoData";
import { createInvestigatorSummary } from "./investigatorSummary";
import { modelHealth } from "./modelData";
import { CASE_STATUSES, RISK_LEVELS, RiskInput, scoreTransaction } from "./riskEngine";

export const riskInputSchema = z.object({
  amount: z.number().positive().max(1000000),
  merchantCategory: z.string().trim().min(2).max(80),
  transactionCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  accountCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  deviceStatus: z.enum(["known", "new"]),
  transactionHour: z.number().int().min(0).max(23),
  recentTransactionCount: z.number().int().min(0).max(50),
});

export const caseUpdateSchema = z.object({
  id: z.number().int().positive(),
  caseStatus: z.enum(CASE_STATUSES),
  note: z.string().trim().min(3).max(1000),
});

const recordsByOrganization = new Map<string, RiskRecord[]>();
let nextId = Math.max(...demoTransactions.map((record) => record.id)) + 1;

function cloneDemoTransaction(record: RiskRecord): RiskRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    factors: [...record.factors],
  };
}

/**
 * Demo records are seeded separately for every active organization. In production,
 * database reads must always be filtered by the same Clerk organization identifier.
 */
function getRecords(orgId: string) {
  let records = recordsByOrganization.get(orgId);
  if (!records) {
    records = demoTransactions.map(cloneDemoTransaction);
    recordsByOrganization.set(orgId, records);
  }
  return records;
}

function getRecord(orgId: string, id: number) {
  return getRecords(orgId).find((record) => record.id === id);
}

export function applyCaseUpdate(record: RiskRecord, input: z.infer<typeof caseUpdateSchema>) {
  record.caseStatus = input.caseStatus;
  record.caseNote = input.note.trim();
  record.isNew = false;
  return record;
}

function createReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FRD-${suffix}`;
}

function merchantName(category: string) {
  return category.trim().split(/\s+/).map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

function asInsertTransaction(record: RiskRecord) {
  return {
    reference: record.reference,
    amountCents: Math.round(record.amount * 100),
    merchantCategory: record.merchantCategory,
    transactionCountry: record.transactionCountry,
    accountCountry: record.accountCountry,
    deviceStatus: record.deviceStatus,
    transactionHour: record.transactionHour,
    recentTransactionCount: record.recentTransactionCount,
    riskLabel: record.riskLevel,
    riskProbability: record.probability,
    factorJson: JSON.stringify(record.factors),
    deterministicExplanation: record.deterministicExplanation,
    llmSummary: record.llmSummary,
    llmNextStep: record.llmNextStep,
    caseStatus: record.caseStatus,
    caseNote: record.caseNote,
    isNew: record.isNew,
  } as const;
}

function buildOverview(records: RiskRecord[]) {
  const total = records.length;
  const highRisk = records.filter((record) => record.riskLevel === "high");
  const underReview = records.filter((record) => record.caseStatus === "under_review");
  const now = Date.now();
  return {
    total,
    highRisk: highRisk.length,
    underReview: underReview.length,
    newlyFlagged: records.filter((record) => record.isNew && record.riskLevel === "high").length,
    averageProbability: total === 0 ? 0 : Math.round(records.reduce((totalValue, record) => totalValue + record.probability, 0) / total),
    riskDistribution: RISK_LEVELS.map((riskLevel) => ({ riskLevel, count: records.filter((record) => record.riskLevel === riskLevel).length })),
    highRiskAlerts: highRisk.filter((record) => now - record.createdAt.getTime() < 1000 * 60 * 60 * 24).slice(0, 5),
    queue: [...records].sort((first, second) => second.probability - first.probability).slice(0, 6),
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
  }),
  administration: router({
    directory: organizationAdministratorProcedure.query(({ ctx }) => getWorkspaceDirectory(ctx.orgId!)),
    invite: organizationAdministratorProcedure.input(z.object({
      emailAddress: z.string().trim().email().max(320),
      organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const invitation = await inviteOrganizationMember({
        orgId: ctx.orgId!,
        inviterUserId: ctx.user!.openId,
        emailAddress: input.emailAddress,
        role: input.organizationRole,
      });
      return { id: invitation.id, email: invitation.emailAddress, role: invitation.role, status: invitation.status };
    }),
    updateOrganizationRole: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
      organizationRole: z.enum(ORGANIZATION_MEMBERSHIP_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const membership = await changeOrganizationMembershipRole({
        orgId: ctx.orgId!,
        actorUserId: ctx.user!.openId,
        userId: input.userId,
        role: input.organizationRole,
      });
      return { userId: membership.publicUserData?.userId ?? input.userId, organizationRole: membership.role };
    }),
    updateFraudLensRole: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
      applicationRole: z.enum(FRAUDLENS_ROLES),
    })).mutation(async ({ ctx, input }) => {
      const user = await changeFraudLensRole({
        orgId: ctx.orgId!,
        actorUserId: ctx.user!.openId,
        userId: input.userId,
        role: input.applicationRole,
      });
      return { userId: input.userId, applicationRole: user?.role ?? input.applicationRole };
    }),
    deactivateMember: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await deactivateOrganizationMember({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, userId: input.userId });
      return { userId: input.userId };
    }),
    revokeSessions: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(({ ctx, input }) => revokeMemberSessions({
      orgId: ctx.orgId!,
      actorUserId: ctx.user!.openId,
      userId: input.userId,
    })),
    revokeInvitation: organizationAdministratorProcedure.input(z.object({
      invitationId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await revokeOrganizationInvitation({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, invitationId: input.invitationId });
      return { invitationId: input.invitationId };
    }),
  }),
  risk: router({
    overview: organizationProcedure.query(({ ctx }) => buildOverview(getRecords(ctx.orgId))),
    list: organizationProcedure.input(z.object({
      riskLevel: z.enum(RISK_LEVELS).optional(),
      caseStatus: z.enum(CASE_STATUSES).optional(),
      merchantCategory: z.string().trim().max(80).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional()).query(({ ctx, input }) => {
      const filtered = getRecords(ctx.orgId).filter((record) => {
        if (input?.riskLevel && record.riskLevel !== input.riskLevel) return false;
        if (input?.caseStatus && record.caseStatus !== input.caseStatus) return false;
        if (input?.merchantCategory && record.merchantCategory.toLowerCase() !== input.merchantCategory.toLowerCase()) return false;
        if (input?.dateFrom && record.createdAt < input.dateFrom) return false;
        if (input?.dateTo && record.createdAt > input.dateTo) return false;
        return true;
      });
      return [...filtered].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
    }),
    detail: organizationProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getRecord(ctx.orgId, input.id) ?? null),
    assess: organizationProcedure.input(riskInputSchema).mutation(async ({ ctx, input }) => {
      const decision = scoreTransaction(input as RiskInput);
      const record: RiskRecord = {
        id: nextId++,
        reference: createReference(),
        merchantName: merchantName(input.merchantCategory),
        createdAt: new Date(),
        caseStatus: "under_review",
        caseNote: null,
        isNew: decision.riskLevel === "high",
        llmSummary: null,
        llmNextStep: null,
        ...input,
        ...decision,
      };
      getRecords(ctx.orgId).unshift(record);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      return record;
    }),
    updateCase: organizationProcedure.input(caseUpdateSchema).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      applyCaseUpdate(record, input);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      return record;
    }),
    summarize: organizationProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const summary = await createInvestigatorSummary({
        riskLevel: record.riskLevel,
        probability: record.probability,
        factors: record.factors,
        deterministicExplanation: record.deterministicExplanation,
      });
      record.llmSummary = summary.summary;
      record.llmNextStep = summary.nextStep;
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      return { record, source: summary.source };
    }),
    modelHealth: organizationManagerProcedure.query(() => modelHealth),
    drift: organizationManagerProcedure.query(() => driftDemo),
    persistenceStatus: organizationProcedure.query(async () => ({ connected: Boolean(await getDb()) })),
  }),
});

export type AppRouter = typeof appRouter;
