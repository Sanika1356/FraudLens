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

const authenticatedUser: AuthenticatedUser = {
  id: 1,
  openId: "user_test_123",
  email: "analyst@example.com",
  name: "Fraud Analyst",
  loginMethod: "clerk",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("Clerk-protected FraudLens APIs", () => {
  it("rejects an unauthenticated request to risk data", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.risk.overview()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("permits an authenticated analyst to read risk data", async () => {
    const caller = appRouter.createCaller(createContext(authenticatedUser));

    const overview = await caller.risk.overview();

    expect(overview.total).toBeGreaterThan(0);
    await expect(caller.auth.me()).resolves.toEqual(authenticatedUser);
  });
});
