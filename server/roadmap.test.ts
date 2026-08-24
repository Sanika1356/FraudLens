import { describe, expect, it } from "vitest";
import {
  completeApiIdempotency,
  activateRiskPolicy,
  completeImportBatch,
  createImportBatch,
  createRiskPolicyDraft,
  createSavedQueueView,
  deleteSavedQueueView,
  getImportBatch,
  getActiveRiskPolicy,
  getActiveRetentionPolicy,
  getChampionModel,
  getModelRegistryByOrganization,
  createModelRegistryCandidate,
  approveModelCandidate,
  rollbackModelChampion,
  getCaseChecklist,
  getImportBatchesByOrganization,
  getRiskPoliciesByOrganization,
  getRetentionPoliciesByOrganization,
  createRetentionPolicyDraft,
  activateRetentionPolicy,
  getSavedQueueViewsByOrganization,
  updateCaseChecklistItem,
  reserveApiIdempotency,
} from "./db";
import { buildThresholdAnalysis } from "./outcomeFeedback";
import { demoTransactions } from "./demoData";
import { buildOperationalReport } from "./reports";
import { DEFAULT_RISK_POLICY, normalizeRiskPolicy } from "./riskPolicy";
import { deriveRiskEntities, getSlaState } from "./routers";
import { scoreTransaction } from "./riskEngine";

describe("FraudLens operational roadmap foundations", () => {
  it("bounds operational export rows after newest-first ordering", () => {
    const report = buildOperationalReport(
      demoTransactions,
      [],
      {},
      new Date("2026-08-24T12:00:00.000Z"),
      1
    );
    expect(report.rows).toHaveLength(1);
    expect(report.summary.assessed).toBe(1);
    expect(report.rows[0]?.assessedAt.getTime()).toBe(
      Math.max(...demoTransactions.map(record => record.createdAt.getTime()))
    );
  });

  it("classifies active cases by SLA state", () => {
    const now = new Date("2026-08-24T12:00:00.000Z").getTime();
    expect(
      getSlaState({ caseStatus: "under_review", dueAt: new Date(now - 1) }, now)
    ).toBe("overdue");
    expect(
      getSlaState(
        { caseStatus: "under_review", dueAt: new Date(now + 60 * 60 * 1000) },
        now
      )
    ).toBe("due_soon");
    expect(
      getSlaState(
        {
          caseStatus: "under_review",
          dueAt: new Date(now + 48 * 60 * 60 * 1000),
        },
        now
      )
    ).toBe("on_track");
    expect(getSlaState({ caseStatus: "under_review", dueAt: null }, now)).toBe(
      "no_deadline"
    );
    expect(
      getSlaState({ caseStatus: "legitimate", dueAt: new Date(now - 1) }, now)
    ).toBe("no_deadline");
  });

  it("keeps saved views isolated by organization and owner", async () => {
    const suffix = `roadmap-${Date.now()}`;
    const first = await createSavedQueueView({
      orgId: `${suffix}-one`,
      ownerId: "analyst-one",
      name: "My overdue cases",
      visibility: "private",
      filters: { queue: "mine", slaState: "overdue" },
      createdByName: "Analyst One",
    });
    await createSavedQueueView({
      orgId: `${suffix}-one`,
      ownerId: "manager-one",
      name: "Shared critical",
      visibility: "shared",
      filters: { queue: "all", priority: "critical" },
      createdByName: "Manager One",
    });
    await createSavedQueueView({
      orgId: `${suffix}-two`,
      ownerId: "analyst-one",
      name: "Other organization",
      visibility: "private",
      filters: { queue: "all" },
      createdByName: "Analyst One",
    });

    const visible = await getSavedQueueViewsByOrganization(
      `${suffix}-one`,
      "analyst-one"
    );
    expect(visible.map(view => view.name)).toEqual([
      "Shared critical",
      "My overdue cases",
    ]);
    expect(
      await deleteSavedQueueView(
        `${suffix}-one`,
        first.id,
        "manager-one",
        false
      )
    ).toBe(false);
    expect(
      await deleteSavedQueueView(
        `${suffix}-one`,
        first.id,
        "analyst-one",
        false
      )
    ).toBe(true);
  });

  it("keeps operational policy signals separate from the model score", () => {
    const decision = scoreTransaction({
      amount: 2500,
      merchantCategory: "electronics",
      transactionCountry: "GB",
      accountCountry: "US",
      deviceStatus: "new",
      transactionHour: 2,
      recentTransactionCount: 7,
    });
    expect(decision.riskLevel).toBe("high");
    expect(decision.policySignals.map(signal => signal.key)).toEqual([
      "policy_high_value_review",
      "policy_cross_border_new_device",
      "policy_velocity_watch",
      "policy_high_risk_queue",
    ]);
    expect(decision.factors.some(factor => factor.key === "new_device")).toBe(
      true
    );
  });

  it("calculates threshold tradeoffs from reviewed outcomes only", () => {
    const analysis = buildThresholdAnalysis(
      [
        { id: 1, probability: 82 },
        { id: 2, probability: 65 },
        { id: 3, probability: 22 },
        { id: 4, probability: 91 },
      ],
      [
        { transactionId: 1, actualOutcome: "fraud" },
        { transactionId: 2, actualOutcome: "fraud" },
        { transactionId: 3, actualOutcome: "legitimate" },
      ],
      70
    );
    expect(analysis.projectedHighRisk).toBe(2);
    expect(analysis.reviewed).toBe(3);
    expect(analysis.confusionMatrix).toEqual({
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 1,
      trueNegative: 1,
    });
    expect(analysis.precisionMilli).toBe(1000);
    expect(analysis.recallMilli).toBe(500);
  });

  it("derives stable, non-sensitive entity keys for related activity", () => {
    const entities = deriveRiskEntities({
      amount: 100,
      merchantCategory: " Electronics ",
      transactionCountry: "US",
      accountCountry: "CA",
      deviceStatus: "new",
      transactionHour: 10,
      recentTransactionCount: 1,
    });
    expect(entities).toMatchObject([
      {
        entityType: "merchant_category",
        entityKey: "electronics",
      },
      {
        entityType: "country_route",
        entityKey: "CA->US",
      },
      {
        entityType: "device_cohort",
        entityKey: "new:CA",
      },
    ]);
  });

  it("normalizes policy bounds and preserves the default scoring contract", () => {
    const normalized = normalizeRiskPolicy({
      highRiskThreshold: 999,
      mediumRiskThreshold: 999,
      highAmountThreshold: 100,
      mediumAmountThreshold: 999999,
      lowAmountThreshold: 999999,
      highVelocityCount: 2,
      mediumVelocityCount: 49,
    });
    expect(normalized.highRiskThreshold).toBe(95);
    expect(normalized.mediumRiskThreshold).toBe(94);
    expect(normalized.mediumAmountThreshold).toBe(99);
    expect(normalized.lowAmountThreshold).toBe(98);
    expect(normalized.mediumVelocityCount).toBe(1);

    const input = {
      amount: 775,
      merchantCategory: "electronics",
      transactionCountry: "US",
      accountCountry: "CA",
      deviceStatus: "new" as const,
      transactionHour: 2,
      recentTransactionCount: 5,
    };
    expect(scoreTransaction(input)).toEqual(
      scoreTransaction(input, DEFAULT_RISK_POLICY)
    );
    expect(
      scoreTransaction(input, {
        ...DEFAULT_RISK_POLICY,
        highRiskThreshold: 95,
      }).riskLevel
    ).toBe("medium");
  });

  it("keeps import batches organization-scoped and tracks preview to completion", async () => {
    const suffix = `batch-${Date.now()}`;
    const batch = await createImportBatch({
      orgId: `${suffix}-one`,
      fileName: "review.csv",
      contentHash: "a".repeat(64),
      totalRows: 4,
      readyRows: 2,
      invalidRows: 1,
      duplicateRows: 1,
      errors: [
        { row: 3, field: "amount", message: "Amount must be positive." },
      ],
      createdById: "manager-one",
      createdByName: "Manager One",
    });
    expect(batch.status).toBe("previewed");
    expect(await getImportBatch(`${suffix}-two`, batch.id)).toBeNull();
    await completeImportBatch(`${suffix}-one`, batch.id, {
      status: "completed",
      importedRows: 2,
    });
    const history = await getImportBatchesByOrganization(`${suffix}-one`);
    expect(history[0]).toMatchObject({
      id: batch.id,
      status: "completed",
      importedRows: 2,
      invalidRows: 1,
      duplicateRows: 1,
    });
  });

  it("keeps guided case checklists isolated and preserves reviewer notes", async () => {
    const transactionId = 4242;
    const firstOrg = `checklist-${Date.now()}-one`;
    const secondOrg = `checklist-${Date.now()}-two`;
    const initial = await getCaseChecklist(firstOrg, transactionId);
    expect(initial).toHaveLength(5);
    expect(initial.every(item => !item.completed)).toBe(true);
    const updated = await updateCaseChecklistItem({
      orgId: firstOrg,
      transactionId,
      itemKey: "device_review",
      completed: true,
      note: "Reviewed approved device context.",
      completedById: "analyst-one",
      completedByName: "Analyst One",
    });
    expect(updated).toMatchObject({
      itemKey: "device_review",
      completed: true,
      note: "Reviewed approved device context.",
    });
    expect(
      (await getCaseChecklist(firstOrg, transactionId)).find(
        item => item.itemKey === "device_review"
      )
    ).toMatchObject({
      completed: true,
      note: "Reviewed approved device context.",
    });
    expect(
      (await getCaseChecklist(secondOrg, transactionId)).find(
        item => item.itemKey === "device_review"
      )
    ).toMatchObject({ completed: false, note: "" });
  });

  it("governs policy drafts through activation and rollback per organization", async () => {
    const suffix = `policy-${Date.now()}`;
    const orgOne = `${suffix}-one`;
    const orgTwo = `${suffix}-two`;
    expect((await getActiveRiskPolicy(orgOne)).version).toBe(1);
    const draft = await createRiskPolicyDraft({
      orgId: orgOne,
      config: { ...DEFAULT_RISK_POLICY, highRiskThreshold: 80 },
      changeNote: "Reduce high-risk queue volume after review.",
      createdById: "manager-one",
      createdByName: "Manager One",
    });
    expect(draft.version).toBe(2);
    expect(await getActiveRiskPolicy(orgTwo)).toMatchObject({ version: 1 });
    const activated = await activateRiskPolicy(
      orgOne,
      draft.id,
      "admin-one",
      "Admin One"
    );
    expect(activated).toMatchObject({ version: 2, status: "active" });
    const rollbackTarget = await createRiskPolicyDraft({
      orgId: orgOne,
      config: { ...DEFAULT_RISK_POLICY, highRiskThreshold: 85 },
      changeNote: "Test a more conservative high-risk cutoff.",
      createdById: "manager-one",
      createdByName: "Manager One",
    });
    await activateRiskPolicy(
      orgOne,
      rollbackTarget.id,
      "admin-one",
      "Admin One"
    );
    const rolledBack = await activateRiskPolicy(
      orgOne,
      draft.id,
      "admin-one",
      "Admin One"
    );
    expect(rolledBack).toMatchObject({ version: 2, status: "active" });
    expect(
      (await getRiskPoliciesByOrganization(orgOne)).find(
        policy => policy.version === 3
      )?.status
    ).toBe("retired");
  });

  it("governs retention policy drafts per organization and preserves rollback history", async () => {
    const suffix = `retention-${Date.now()}`;
    const orgOne = `${suffix}-one`;
    const orgTwo = `${suffix}-two`;
    expect((await getActiveRetentionPolicy(orgOne)).version).toBe(1);
    const draft = await createRetentionPolicyDraft({
      orgId: orgOne,
      transactionRetentionDays: 180,
      evidenceRetentionDays: 180,
      auditRetentionDays: 365,
      effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
      changeNote: "Shorten retention after approved review.",
      createdById: "manager-one",
      createdByName: "Manager One",
    });
    expect(draft.version).toBe(2);
    expect((await getActiveRetentionPolicy(orgTwo)).version).toBe(1);
    await expect(
      activateRetentionPolicy(orgTwo, draft.id, "admin-two", "Admin Two")
    ).rejects.toThrow("Retention policy is not eligible for activation.");
    const activated = await activateRetentionPolicy(
      orgOne,
      draft.id,
      "admin-one",
      "Admin One"
    );
    expect(activated).toMatchObject({ version: 2, status: "active" });
    expect(
      (await getRetentionPoliciesByOrganization(orgOne)).some(
        policy => policy.version === 1 && policy.status === "retired"
      )
    ).toBe(true);
  });

  it("keeps model registry candidates organization-scoped through approval and rollback", async () => {
    const suffix = `model-${Date.now()}`;
    const orgOne = `${suffix}-one`;
    const orgTwo = `${suffix}-two`;
    const evaluation = {
      precisionMilli: 450,
      recallMilli: 800,
      f1Milli: 580,
      prAucMilli: 650,
      threshold: 0.9,
      reviewed: 10000,
    };
    const candidate = await createModelRegistryCandidate({
      orgId: orgOne,
      modelKey: "fraudlens-demonstration",
      version: "candidate-1",
      artifactHash: "sha256-candidate-1",
      datasetLabel: "Reviewed holdout",
      evaluation,
      changeNote: "Candidate evaluation for controlled review.",
      createdById: "manager-one",
      createdByName: "Manager One",
    });
    expect(candidate.status).toBe("challenger");
    expect((await getChampionModel(orgTwo)).version).toBe("fraudlens-lr-0.2");
    await expect(
      approveModelCandidate(orgTwo, candidate.id, "admin-two", "Admin Two")
    ).rejects.toThrow("Only challenger models can be approved.");
    const champion = await approveModelCandidate(
      orgOne,
      candidate.id,
      "admin-one",
      "Admin One"
    );
    expect(champion).toMatchObject({
      version: "candidate-1",
      status: "champion",
    });
    const retired = (await getModelRegistryByOrganization(orgOne)).find(
      model => model.version === "fraudlens-lr-0.2"
    );
    expect(retired?.status).toBe("retired");
    const restored = await rollbackModelChampion(
      orgOne,
      retired!.id,
      "admin-one",
      "Admin One"
    );
    expect(restored).toMatchObject({
      version: "fraudlens-lr-0.2",
      status: "champion",
    });
  });

  it("replays a completed idempotent response for the same API key and key", async () => {
    const suffix = `idempotency-${Date.now()}`;
    const first = await reserveApiIdempotency({
      orgId: "org_idempotency",
      apiKeyId: 911,
      idempotencyKey: suffix,
      requestHash: "hash-one",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(first.created).toBe(true);

    await completeApiIdempotency(
      911,
      suffix,
      201,
      JSON.stringify({ requestId: "req_test", transaction: { id: 1 } }),
      "REF-1"
    );
    const replay = await reserveApiIdempotency({
      orgId: "org_idempotency",
      apiKeyId: 911,
      idempotencyKey: suffix,
      requestHash: "hash-one",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(replay.created).toBe(false);
    expect(replay.record.status).toBe("completed");
    expect(replay.record.responseStatus).toBe(201);
    expect(replay.record.responseJson).toContain("req_test");
  });
});
