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
import { getAuditEventsByOrganization, getDb, persistTransaction, recordAuditEvent } from "./db";
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

export const CASE_PRIORITIES = ["critical", "high", "standard"] as const;
export const caseWorkflowUpdateSchema = z.object({
  id: z.number().int().positive(),
  assigneeId: z.string().trim().min(1).max(64).nullable(),
  casePriority: z.enum(CASE_PRIORITIES),
  dueAt: z.date().nullable(),
});

const recordsByOrganization = new Map<string, RiskRecord[]>();
let nextId = Math.max(...demoTransactions.map((record) => record.id)) + 1;

function cloneDemoTransaction(record: RiskRecord): RiskRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    factors: [...record.factors],
    dueAt: record.dueAt ? new Date(record.dueAt) : null,
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

export function applyCaseWorkflowUpdate(
  record: RiskRecord,
  input: z.infer<typeof caseWorkflowUpdateSchema>,
  assigneeName: string | null,
) {
  record.assigneeId = input.assigneeId;
  record.assigneeName = assigneeName;
  record.casePriority = input.casePriority;
  record.dueAt = input.dueAt ? new Date(input.dueAt) : null;
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
    assigneeId: record.assigneeId,
    assigneeName: record.assigneeName,
    casePriority: record.casePriority,
    dueAt: record.dueAt,
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
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user && ctx.orgId) {
        await recordAuditEvent({
          orgId: ctx.orgId,
          eventType: "authentication.workspace_accessed",
          actorId: ctx.user.openId,
          actorName: ctx.user.name ?? ctx.user.email,
          subjectType: "workspace",
          subjectId: ctx.orgId,
          summary: "Authenticated user accessed the active workspace.",
        });
      }
      return ctx.user;
    }),
  }),
  audit: router({
    list: organizationManagerProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
      const events = await getAuditEventsByOrganization(ctx.orgId, input?.limit ?? 100);
      return events.map((event) => {
        let metadata: Record<string, unknown> = {};
        try { metadata = JSON.parse(event.metadataJson) as Record<string, unknown>; } catch { /* preserve the event if legacy metadata is malformed */ }
        return { ...event, metadata };
      });
    }),
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
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.member_invited", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "invitation", subjectId: invitation.id, summary: "Invited a member to the workspace.", metadata: { organizationRole: invitation.role } });
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
      const userId = membership.publicUserData?.userId ?? input.userId;
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.organization_role_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: userId, summary: "Changed a member's organization role.", metadata: { organizationRole: membership.role } });
      return { userId, organizationRole: membership.role };
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
      const applicationRole = user?.role ?? input.applicationRole;
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.application_role_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Changed a member's FraudLens role.", metadata: { applicationRole } });
      return { userId: input.userId, applicationRole };
    }),
    deactivateMember: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await deactivateOrganizationMember({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, userId: input.userId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.member_deactivated", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Deactivated a member's access to this workspace." });
      return { userId: input.userId };
    }),
    revokeSessions: organizationAdministratorProcedure.input(z.object({
      userId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      const result = await revokeMemberSessions({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, userId: input.userId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.sessions_revoked", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "member", subjectId: input.userId, summary: "Revoked a member's active sessions.", metadata: { revokedCount: result.revokedCount } });
      return result;
    }),
    revokeInvitation: organizationAdministratorProcedure.input(z.object({
      invitationId: z.string().trim().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      await revokeOrganizationInvitation({ orgId: ctx.orgId!, actorUserId: ctx.user!.openId, invitationId: input.invitationId });
      await recordAuditEvent({ orgId: ctx.orgId!, eventType: "administration.invitation_revoked", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "invitation", subjectId: input.invitationId, summary: "Revoked a pending workspace invitation." });
      return { invitationId: input.invitationId };
    }),
  }),
  risk: router({
    overview: organizationProcedure.query(({ ctx }) => buildOverview(getRecords(ctx.orgId))),
    list: organizationProcedure.input(z.object({
      riskLevel: z.enum(RISK_LEVELS).optional(),
      caseStatus: z.enum(CASE_STATUSES).optional(),
      casePriority: z.enum(CASE_PRIORITIES).optional(),
      assigneeId: z.string().trim().min(1).max(64).optional(),
      unassignedOnly: z.boolean().optional(),
      merchantCategory: z.string().trim().max(80).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }).optional()).query(({ ctx, input }) => {
      const filtered = getRecords(ctx.orgId).filter((record) => {
        if (input?.riskLevel && record.riskLevel !== input.riskLevel) return false;
        if (input?.caseStatus && record.caseStatus !== input.caseStatus) return false;
        if (input?.casePriority && record.casePriority !== input.casePriority) return false;
        if (input?.assigneeId && record.assigneeId !== input.assigneeId) return false;
        if (input?.unassignedOnly && record.assigneeId !== null) return false;
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
        assigneeId: null,
        assigneeName: null,
        casePriority: decision.riskLevel === "high" ? "critical" : decision.riskLevel === "medium" ? "high" : "standard",
        dueAt: decision.riskLevel === "high" ? new Date(Date.now() + 4 * 60 * 60 * 1000) : decision.riskLevel === "medium" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
        isNew: decision.riskLevel === "high",
        llmSummary: null,
        llmNextStep: null,
        ...input,
        ...decision,
      };
      getRecords(ctx.orgId).unshift(record);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.assessment_created", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Created case ${record.reference} from a risk assessment.`, metadata: { riskLevel: record.riskLevel, casePriority: record.casePriority } });
      return record;
    }),
    updateCase: organizationProcedure.input(caseUpdateSchema).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      const previousStatus = record.caseStatus;
      applyCaseUpdate(record, input);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.status_changed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Changed ${record.reference} from ${previousStatus} to ${record.caseStatus}.`, metadata: { previousStatus, caseStatus: record.caseStatus, noteAdded: Boolean(record.caseNote) } });
      return record;
    }),
    assignees: organizationProcedure.query(async ({ ctx }) => {
      const directory = await getWorkspaceDirectory(ctx.orgId);
      return directory.members.map((member) => ({ userId: member.userId, name: member.name, email: member.email, applicationRole: member.applicationRole }));
    }),
    claimCase: organizationProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      if (record.caseStatus !== "under_review") throw new Error("Only active cases can be assigned.");
      if (record.assigneeId && record.assigneeId !== ctx.user!.openId) throw new Error("This case is already assigned to another investigator.");
      const previousAssigneeId = record.assigneeId;
      record.assigneeId = ctx.user!.openId;
      record.assigneeName = ctx.user!.name ?? ctx.user!.email ?? "Assigned investigator";
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.claimed", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Claimed case ${record.reference}.`, metadata: { previousAssigneeId, assigneeId: record.assigneeId } });
      return record;
    }),
    updateWorkflow: organizationManagerProcedure.input(caseWorkflowUpdateSchema).mutation(async ({ ctx, input }) => {
      const record = getRecord(ctx.orgId, input.id);
      if (!record) throw new Error("Transaction not found");
      if (record.caseStatus !== "under_review") throw new Error("Only active cases can be updated.");
      let assigneeName: string | null = null;
      if (input.assigneeId) {
        const directory = await getWorkspaceDirectory(ctx.orgId);
        const assignee = directory.members.find((member) => member.userId === input.assigneeId);
        if (!assignee) throw new Error("Select an active member of this organization as the assignee.");
        assigneeName = assignee.name ?? assignee.email ?? "Assigned investigator";
      }
      const previous = { assigneeId: record.assigneeId, casePriority: record.casePriority, dueAt: record.dueAt?.toISOString() ?? null };
      applyCaseWorkflowUpdate(record, input, assigneeName);
      await persistTransaction(ctx.orgId, asInsertTransaction(record));
      await recordAuditEvent({ orgId: ctx.orgId, eventType: "case.workflow_updated", actorId: ctx.user!.openId, actorName: ctx.user!.name ?? ctx.user!.email, subjectType: "case", subjectId: String(record.id), summary: `Updated assignment and service settings for ${record.reference}.`, metadata: { previous, assigneeId: record.assigneeId, casePriority: record.casePriority, dueAt: record.dueAt?.toISOString() ?? null } });
      return record;
    }),
    workload: organizationManagerProcedure.query(({ ctx }) => {
      const activeCases = getRecords(ctx.orgId).filter((record) => record.caseStatus === "under_review");
      const now = Date.now();
      const byAssignee = new Map<string, { userId: string; name: string; open: number; critical: number; overdue: number }>();
      for (const record of activeCases) {
        if (!record.assigneeId) continue;
        const current = byAssignee.get(record.assigneeId) ?? { userId: record.assigneeId, name: record.assigneeName ?? "Assigned investigator", open: 0, critical: 0, overdue: 0 };
        current.open += 1;
        if (record.casePriority === "critical") current.critical += 1;
        if (record.dueAt && record.dueAt.getTime() < now) current.overdue += 1;
        byAssignee.set(record.assigneeId, current);
      }
      const unassigned = activeCases.filter((record) => !record.assigneeId);
      return {
        active: activeCases.length,
        unassigned: unassigned.length,
        overdue: activeCases.filter((record) => record.dueAt && record.dueAt.getTime() < now).length,
        byAssignee: Array.from(byAssignee.values()).sort((first, second) => second.open - first.open || first.name.localeCompare(second.name)),
      };
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
