import { getAuth, type ExpressRequestWithAuth } from "@clerk/express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { resolveBootstrapRole } from "./env";
import { captureServerException, logServerError } from "./monitoring";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** The active Clerk organization for this request, if one has been selected. */
  orgId: string | null;
  /** The current user's Clerk membership role in the active organization. */
  orgRole: string | null;
};

function createSessionUser(openId: string): User {
  const now = new Date();
  return {
    id: 0,
    openId,
    name: null,
    email: null,
    loginMethod: "clerk",
    role: resolveBootstrapRole(openId),
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  const auth = getAuth(opts.req as ExpressRequestWithAuth);
  let user: User | null = null;

  if (auth.userId) {
    try {
      user = (await getUserByOpenId(auth.userId)) ?? null;
      if (!user) {
        await upsertUser({
          openId: auth.userId,
          loginMethod: "clerk",
          role: resolveBootstrapRole(auth.userId),
        });
        user = (await getUserByOpenId(auth.userId)) ?? null;
      }
    } catch (error) {
      console.error("Unable to synchronize the authenticated FraudLens user.", error);
      captureServerException(error, { area: "authentication", operation: "synchronize_user" });
      logServerError("Unable to synchronize the authenticated FraudLens user", {
        area: "authentication",
        operation: "synchronize_user",
      });
    }

    // A local database is optional in development, so an authenticated Clerk
    // session remains valid while user persistence is unavailable.
    user ??= createSessionUser(auth.userId);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    orgId: auth.orgId ?? null,
    orgRole: auth.orgRole ?? null,
  };
}
