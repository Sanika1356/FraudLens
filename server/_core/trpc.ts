import { UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { isIncidentModeEnabled } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export type FraudLensRole = NonNullable<TrpcContext["user"]>["role"];

const ROLE_LABELS: Record<FraudLensRole, string> = {
  analyst: "an analyst",
  manager: "a manager",
  admin: "an administrator",
};

function roleProcedure(...allowedRoles: FraudLensRole[]) {
  return t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;

      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: UNAUTHED_ERR_MSG,
        });
      }

      const effectiveRole =
        ctx.appRole ??
        (process.env.NODE_ENV === "test" ? ctx.user.role : "analyst");
      if (!allowedRoles.includes(effectiveRole)) {
        const requirement = allowedRoles
          .map(role => ROLE_LABELS[role])
          .join(" or ");
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This action requires ${requirement}.`,
        });
      }

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
        },
      });
    })
  );
}

export const analystProcedure = roleProcedure("analyst", "manager", "admin");
export const managerProcedure = roleProcedure("manager", "admin");
export const adminProcedure = roleProcedure("admin");

const activeOrganizationMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Select an active organization workspace to access this data.",
    });
  }

  return next({
    ctx: {
      orgId: ctx.orgId,
      orgRole: ctx.orgRole,
    },
  });
});

const incidentModeMiddleware = t.middleware(
  async ({ ctx, next, path, type }) => {
    if (
      type === "mutation" &&
      ctx.orgId &&
      path !== "security.setIncidentMode"
    ) {
      if (await isIncidentModeEnabled(ctx.orgId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Incident mode is active for this workspace. Changes are temporarily disabled until an organization administrator exits incident mode.",
        });
      }
    }
    return next({ ctx });
  }
);

/** Requires a signed-in FraudLens user with an active Clerk organization. */
export const organizationProcedure = analystProcedure
  .use(incidentModeMiddleware)
  .use(activeOrganizationMiddleware);
/** Requires a manager or administrator in an active Clerk organization. */
export const organizationManagerProcedure = managerProcedure
  .use(incidentModeMiddleware)
  .use(activeOrganizationMiddleware);
/** Requires both a FraudLens administrator and Clerk organization administrator membership. */
export const organizationAdministratorProcedure = adminProcedure
  .use(incidentModeMiddleware)
  .use(activeOrganizationMiddleware)
  .use(
    t.middleware(async ({ ctx, next }) => {
      if (ctx.orgRole !== "org:admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This action requires administrator membership in the active organization.",
        });
      }

      return next({ ctx });
    })
  );

// Backward-compatible shorthand for any signed-in FraudLens user.
export const protectedProcedure = analystProcedure;
