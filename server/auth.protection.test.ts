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

  it("prevents an analyst from viewing model-monitoring data", async () => {
    const caller = appRouter.createCaller(createContext(createUser("analyst")));

    await expect(caller.risk.modelHealth()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.risk.drift()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("permits managers and administrators to view model-monitoring data", async () => {
    const manager = appRouter.createCaller(createContext(createUser("manager")));
    const administrator = appRouter.createCaller(createContext(createUser("admin")));

    await expect(manager.risk.modelHealth()).resolves.toBeDefined();
    await expect(administrator.risk.drift()).resolves.toBeDefined();
  });
});
