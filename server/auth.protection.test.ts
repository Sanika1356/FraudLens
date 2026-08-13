import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(
  user: AuthenticatedUser | null,
  orgId: string | null = "org_fraudlens_demo",
): TrpcContext {
  return {
    user,
    orgId,
    orgRole: orgId ? "org:admin" : null,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createUser(role: AuthenticatedUser["role"]): AuthenticatedUser {
  return {
    id: 1,
    openId: `${role}_test_123`,
    email: `${role}@example.com`,
    name: `FraudLens ${role}`,
    loginMethod: "clerk",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

describe("Clerk-protected FraudLens APIs", () => {
  it("rejects an unauthenticated request to risk data", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.risk.overview()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a signed-in user who has not selected an active organization", async () => {
    const caller = appRouter.createCaller(createContext(createUser("analyst"), null));

    await expect(caller.risk.overview()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Select an active organization workspace to access this data.",
    });
  });

  it("permits an analyst to view transactions and update an investigation case", async () => {
    const analyst = createUser("analyst");
    const caller = appRouter.createCaller(createContext(analyst));
    const firstRecord = (await caller.risk.list({}))[0];

    expect(firstRecord).toBeDefined();
    await expect(caller.risk.updateCase({
      id: firstRecord!.id,
      caseStatus: "under_review",
      note: "Analyst access verification.",
    })).resolves.toMatchObject({ id: firstRecord!.id, caseStatus: "under_review" });
    await expect(caller.auth.me()).resolves.toEqual(analyst);
  });

  it("does not expose newly assessed transactions across organizations", async () => {
    const firstWorkspace = appRouter.createCaller(createContext(createUser("analyst"), "org_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("analyst"), "org_second"));

    const assessed = await firstWorkspace.risk.assess({
      amount: 775,
      merchantCategory: "electronics",
      transactionCountry: "US",
      accountCountry: "US",
      deviceStatus: "new",
      transactionHour: 2,
      recentTransactionCount: 5,
    });

    await expect(firstWorkspace.risk.detail({ id: assessed.id })).resolves.toMatchObject({ id: assessed.id });
    await expect(secondWorkspace.risk.detail({ id: assessed.id })).resolves.toBeNull();
  });

  it("requires an active organization before exposing private evidence storage status", async () => {
    const withoutWorkspace = appRouter.createCaller(createContext(createUser("analyst"), null));
    const activeWorkspace = appRouter.createCaller(createContext(createUser("analyst"), "org_evidence_status"));

    await expect(withoutWorkspace.risk.evidenceStorageStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(activeWorkspace.risk.evidenceStorageStatus()).resolves.toMatchObject({ provider: "Supabase Storage", maximumAttachmentBytes: 5 * 1024 * 1024 });
  });

  it("rejects Team Access controls without an active organization", async () => {
    const caller = appRouter.createCaller(createContext(createUser("admin"), null));

    await expect(caller.administration.directory()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Select an active organization workspace to access this data.",
    });
  });

  it("requires both FraudLens and organization administrator roles for Team Access", async () => {
    const applicationAnalyst = appRouter.createCaller(createContext(createUser("analyst")));
    const organizationMemberContext = {
      ...createContext(createUser("admin")),
      orgRole: "org:member",
    } as TrpcContext;
    const organizationMember = appRouter.createCaller(organizationMemberContext);

    await expect(applicationAnalyst.administration.directory()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(organizationMember.administration.directory()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This action requires administrator membership in the active organization.",
    });
  });

  it("prevents a non-administrator from submitting Team Access mutations", async () => {
    const caller = appRouter.createCaller(createContext(createUser("manager")));

    await expect(caller.administration.invite({
      emailAddress: "new.member@example.com",
      organizationRole: "org:member",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows analysts to claim cases but reserves assignment and workload management for managers", async () => {
    const analyst = appRouter.createCaller(createContext(createUser("analyst")));
    const manager = appRouter.createCaller(createContext(createUser("manager")));
    const record = (await analyst.risk.list({ caseStatus: "under_review", unassignedOnly: true }))[0];
    if (!record) throw new Error("Expected an unassigned demo case");

    await expect(analyst.risk.claimCase({ id: record.id })).resolves.toMatchObject({ assigneeId: "analyst_test_123" });
    await expect(analyst.risk.updateWorkflow({ id: record.id, assigneeId: null, casePriority: "high", dueAt: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.risk.workload()).resolves.toMatchObject({ active: expect.any(Number) });
  });

  it("requires manager access for CSV import and reports invalid rows without blocking valid scored records", async () => {
    const csv = [
      "reference,amount,merchantCategory,transactionCountry,accountCountry,deviceStatus,transactionHour,recentTransactionCount",
      "FRAUD-IMPORT-VALID,610.25,electronics,US,US,new,1,6",
      "FRAUD-IMPORT-BAD,0,electronics,US,US,new,25,6",
    ].join("\n");
    const payload = { fileName: "batch.csv", contentBase64: Buffer.from(csv, "utf8").toString("base64") };
    const analyst = appRouter.createCaller(createContext(createUser("analyst"), "org_csv_permissions"));
    const manager = appRouter.createCaller(createContext(createUser("manager"), "org_csv_permissions"));

    await expect(analyst.risk.importCsv(payload)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const imported = await manager.risk.importCsv(payload);

    expect(imported).toMatchObject({ totalRows: 2, imported: 1, invalidRows: 1 });
    expect(imported.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 3, field: "amount" })]));
    expect((await manager.risk.list({})).some((record) => record.reference === "FRAUD-IMPORT-VALID")).toBe(true);
  });

  it("keeps CSV transaction references and duplicate checks isolated to each organization", async () => {
    const csv = [
      "reference,amount,merchantCategory,transactionCountry,accountCountry,deviceStatus,transactionHour,recentTransactionCount",
      "FRAUD-IMPORT-ISOLATED,775,electronics,US,US,new,2,7",
    ].join("\n");
    const payload = { fileName: "isolated.csv", contentBase64: Buffer.from(csv, "utf8").toString("base64") };
    const firstWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_csv_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_csv_second"));

    await expect(firstWorkspace.risk.importCsv(payload)).resolves.toMatchObject({ imported: 1, duplicates: 0 });
    await expect(firstWorkspace.risk.importCsv(payload)).resolves.toMatchObject({ imported: 0, duplicates: 1 });
    await expect(secondWorkspace.risk.importCsv(payload)).resolves.toMatchObject({ imported: 1, duplicates: 0 });
    expect((await firstWorkspace.risk.list({})).filter((record) => record.reference === "FRAUD-IMPORT-ISOLATED")).toHaveLength(1);
    expect((await secondWorkspace.risk.list({})).filter((record) => record.reference === "FRAUD-IMPORT-ISOLATED")).toHaveLength(1);
  });

  it("records case workflow events in an immutable organization-scoped audit history", async () => {
    const firstWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_audit_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_audit_second"));
    const assessed = await firstWorkspace.risk.assess({
      amount: 920,
      merchantCategory: "electronics",
      transactionCountry: "US",
      accountCountry: "US",
      deviceStatus: "new",
      transactionHour: 1,
      recentTransactionCount: 8,
    });
    await firstWorkspace.risk.updateCase({ id: assessed.id, caseStatus: "under_review", note: "Audit event verification." });

    const firstHistory = await firstWorkspace.audit.list({ limit: 20 });
    const secondHistory = await secondWorkspace.audit.list({ limit: 20 });

    expect(firstHistory.map((event) => event.eventType)).toEqual(expect.arrayContaining(["case.assessment_created", "case.status_changed"]));
    expect(secondHistory.some((event) => event.subjectId === String(assessed.id))).toBe(false);
  });

  it("stores investigator comments, tags, and evidence links only inside the active workspace", async () => {
    const firstWorkspace = appRouter.createCaller(createContext(createUser("analyst"), "org_collaboration_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("analyst"), "org_collaboration_second"));
    const record = (await firstWorkspace.risk.list({}))[0];
    if (!record) throw new Error("Expected a demo record");

    await firstWorkspace.risk.addComment({ id: record.id, comment: "Escalated after verifying the device mismatch." });
    await firstWorkspace.risk.setTags({ id: record.id, tags: ["device-mismatch", "repeat-activity"] });
    await firstWorkspace.risk.addEvidenceLink({ id: record.id, label: "Verification record", url: "https://evidence.example.com/records/123" });

    const firstCollaboration = await firstWorkspace.risk.collaboration({ id: record.id });
    const secondCollaboration = await secondWorkspace.risk.collaboration({ id: record.id });

    expect(firstCollaboration.comments.map((comment) => comment.note)).toContain("Escalated after verifying the device mismatch.");
    expect(firstCollaboration.tags.map((tag) => tag.tag)).toEqual(expect.arrayContaining(["device-mismatch", "repeat-activity"]));
    expect(firstCollaboration.evidence.map((evidence) => evidence.url)).toContain("https://evidence.example.com/records/123");
    expect(firstCollaboration.activity.map((event) => event.eventType)).toEqual(expect.arrayContaining(["case.comment_added", "case.tags_updated", "case.evidence_link_added"]));
    expect(secondCollaboration.comments).toHaveLength(0);
    expect(secondCollaboration.tags).toHaveLength(0);
    expect(secondCollaboration.evidence).toHaveLength(0);
  });

  it("requires a resolution reason before a case can be closed", async () => {
    const caller = appRouter.createCaller(createContext(createUser("analyst"), "org_resolution_required"));
    const record = (await caller.risk.list({ caseStatus: "under_review" }))[0];
    if (!record) throw new Error("Expected an active demo case");

    await expect(caller.risk.updateCase({ id: record.id, caseStatus: "legitimate", note: "Investigation completed with no fraud indicators." })).rejects.toThrow("Select a resolution reason before closing a case.");
    await expect(caller.risk.updateCase({ id: record.id, caseStatus: "legitimate", note: "Investigation completed with no fraud indicators.", resolutionReasonCode: "customer_verified" })).resolves.toMatchObject({ resolutionReasonCode: "customer_verified" });
  });

  it("prevents analysts from reading the manager-only audit history", async () => {
    const caller = appRouter.createCaller(createContext(createUser("analyst"), "org_audit_restricted"));

    await expect(caller.audit.list({ limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents an analyst from viewing model-monitoring data", async () => {
    const caller = appRouter.createCaller(createContext(createUser("analyst")));

    await expect(caller.risk.modelHealth()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.risk.drift()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requires manager access and an active organization for notification preferences", async () => {
    const analyst = appRouter.createCaller(createContext(createUser("analyst"), "org_notification_access"));
    const managerWithoutWorkspace = appRouter.createCaller(createContext(createUser("manager"), null));
    const manager = appRouter.createCaller(createContext(createUser("manager"), "org_notification_access"));

    await expect(analyst.notifications.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(managerWithoutWorkspace.notifications.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Select an active organization workspace to access this data.",
    });
    await expect(manager.notifications.update({
      emailEnabled: false,
      toEmail: null,
      slackEnabled: false,
      slackWebhookUrl: null,
      teamsEnabled: false,
      teamsWebhookUrl: null,
      riskThreshold: 74,
    })).resolves.toMatchObject({ orgId: "org_notification_access", riskThreshold: 74 });
  });

  it("keeps notification preferences isolated to their active organization", async () => {
    const firstWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_notification_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_notification_second"));

    await firstWorkspace.notifications.update({
      emailEnabled: false,
      toEmail: null,
      slackEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/services/T123/B123/secret",
      teamsEnabled: false,
      teamsWebhookUrl: null,
      riskThreshold: 67,
    });

    await expect(firstWorkspace.notifications.get()).resolves.toMatchObject({ orgId: "org_notification_first", slackEnabled: true, riskThreshold: 67 });
    await expect(secondWorkspace.notifications.get()).resolves.toMatchObject({ orgId: "org_notification_second", slackEnabled: false, riskThreshold: 80 });
  });

  it("records confirmed outcomes in the active organization only", async () => {
    const firstWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_feedback_first"));
    const secondWorkspace = appRouter.createCaller(createContext(createUser("manager"), "org_feedback_second"));
    const assessed = await firstWorkspace.risk.assess({
      amount: 2000,
      merchantCategory: "electronics",
      transactionCountry: "CA",
      accountCountry: "US",
      deviceStatus: "new",
      transactionHour: 1,
      recentTransactionCount: 7,
    });

    await firstWorkspace.risk.updateCase({
      id: assessed.id,
      caseStatus: "confirmed_fraud",
      note: "Confirmed through approved investigation evidence.",
      resolutionReasonCode: "pattern_match",
    });

    await expect(firstWorkspace.risk.modelHealth()).resolves.toMatchObject({
      reviewed: 1,
      confirmedFraud: 1,
      confusionMatrix: { truePositive: 1, falsePositive: 0, falseNegative: 0, trueNegative: 0 },
    });
    await expect(secondWorkspace.risk.modelHealth()).resolves.toMatchObject({ reviewed: 0 });
  });

  it("permits managers and administrators to view model-monitoring data", async () => {
    const manager = appRouter.createCaller(createContext(createUser("manager")));
    const administrator = appRouter.createCaller(createContext(createUser("admin")));

    await expect(manager.risk.modelHealth()).resolves.toBeDefined();
    await expect(administrator.risk.drift()).resolves.toBeDefined();
  });
});
