import { z } from "zod";
import { notifyOwner } from "./notification";
import { recordAuditEvent } from "../db";
import {
  organizationAdministratorProcedure,
  publicProcedure,
  router,
} from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: organizationAdministratorProcedure
    .input(
      z.object({
        title: z.string().trim().min(1, "title is required").max(1200),
        content: z.string().trim().min(1, "content is required").max(20000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const delivered = await notifyOwner(input);
      await recordAuditEvent({
        orgId: ctx.orgId!,
        eventType: "system.owner_notification_requested",
        actorId: ctx.user!.openId,
        actorName: ctx.user!.name ?? ctx.user!.email,
        subjectType: "owner_notification",
        subjectId: null,
        summary: "Requested a project-owner notification.",
        metadata: { delivered },
      });
      return {
        success: delivered,
      } as const;
    }),
});
