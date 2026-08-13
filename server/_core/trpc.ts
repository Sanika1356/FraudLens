import { UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

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
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }

      if (!allowedRoles.includes(ctx.user.role)) {
        const requirement = allowedRoles.map(role => ROLE_LABELS[role]).join(" or ");
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
    }),
  );
}

export const analystProcedure = roleProcedure("analyst", "manager", "admin");
export const managerProcedure = roleProcedure("manager", "admin");
export const adminProcedure = roleProcedure("admin");

// Backward-compatible shorthand for any signed-in FraudLens user.
export const protectedProcedure = analystProcedure;
