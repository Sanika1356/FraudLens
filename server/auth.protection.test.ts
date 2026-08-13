import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
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
