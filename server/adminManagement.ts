import { clerkClient } from "@clerk/express";
import { eq, inArray } from "drizzle-orm";
import { users, type User } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb, getUserByOpenId, upsertUser } from "./db";

export const ORGANIZATION_MEMBERSHIP_ROLES = [
  "org:admin",
  "org:member",
] as const;
export type OrganizationMembershipRole =
  (typeof ORGANIZATION_MEMBERSHIP_ROLES)[number];
export const FRAUDLENS_ROLES = ["analyst", "manager", "admin"] as const;
export type FraudLensRole = (typeof FRAUDLENS_ROLES)[number];

export type WorkspaceMember = {
  userId: string;
  membershipId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  organizationRole: string;
  applicationRole: FraudLensRole;
  joinedAt: Date;
};

function toDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function assertNotBootstrapOwner(userId: string) {
  if (userId === ENV.ownerOpenId) {
    throw new Error(
      "The configured FraudLens owner cannot be changed from the administrator console."
    );
  }
}

async function assertOrganizationMember(orgId: string, userId: string) {
  const memberships =
    await clerkClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });
  const membership = memberships.data.find(
    item => item.publicUserData?.userId === userId
  );
  if (!membership)
    throw new Error(
      "The selected user is not a member of the active organization."
    );
  return membership;
}

async function assertNotRemovingLastOrganizationAdministrator(
  orgId: string,
  membership: Awaited<ReturnType<typeof assertOrganizationMember>>,
  willRemainAdministrator: boolean
) {
  if (membership.role !== "org:admin" || willRemainAdministrator) return;
  const memberships =
    await clerkClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });
  const administratorCount = memberships.data.filter(
    item => item.role === "org:admin"
  ).length;
  if (administratorCount <= 1) {
    throw new Error(
      "Assign another organization administrator before removing the final administrator role."
    );
  }
}

async function getLocalUserRoles(userIds: string[]) {
  const db = await getDb();
  if (!db || userIds.length === 0) return new Map<string, User>();
  const rows = await db
    .select()
    .from(users)
    .where(inArray(users.openId, userIds));
  return new Map(rows.map(user => [user.openId, user]));
}

export async function getWorkspaceDirectory(orgId: string) {
  const [memberships, invitations] = await Promise.all([
    clerkClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    }),
    clerkClient.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      limit: 100,
    }),
  ]);
  const localUsers = await getLocalUserRoles(
    memberships.data.flatMap(membership => {
      const userId = membership.publicUserData?.userId;
      return userId ? [userId] : [];
    })
  );

  return {
    members: memberships.data.flatMap<WorkspaceMember>(membership => {
      const publicUser = membership.publicUserData;
      if (!publicUser) return [];
      return [
        {
          userId: publicUser.userId,
          membershipId: membership.id,
          name: toDisplayName(publicUser.firstName, publicUser.lastName),
          email: publicUser.identifier ?? null,
          imageUrl: publicUser.imageUrl ?? null,
          organizationRole: membership.role,
          applicationRole: localUsers.get(publicUser.userId)?.role ?? "analyst",
          joinedAt: new Date(membership.createdAt),
        },
      ];
    }),
    invitations: invitations.data.map(invitation => ({
      id: invitation.id,
      email: invitation.emailAddress,
      role: invitation.role,
      status: invitation.status,
      createdAt: new Date(invitation.createdAt),
    })),
  };
}

export async function inviteOrganizationMember(input: {
  orgId: string;
  inviterUserId: string;
  emailAddress: string;
  role: OrganizationMembershipRole;
}) {
  return clerkClient.organizations.createOrganizationInvitation({
    organizationId: input.orgId,
    inviterUserId: input.inviterUserId,
    emailAddress: input.emailAddress,
    role: input.role,
  });
}

export async function changeOrganizationMembershipRole(input: {
  orgId: string;
  actorUserId: string;
  userId: string;
  role: OrganizationMembershipRole;
}) {
  if (input.userId === input.actorUserId) {
    throw new Error(
      "Administrators cannot change their own organization role from this console."
    );
  }
  assertNotBootstrapOwner(input.userId);
  const membership = await assertOrganizationMember(input.orgId, input.userId);
  await assertNotRemovingLastOrganizationAdministrator(
    input.orgId,
    membership,
    input.role === "org:admin"
  );
  return clerkClient.organizations.updateOrganizationMembership({
    organizationId: input.orgId,
    userId: input.userId,
    role: input.role,
  });
}

export async function changeFraudLensRole(input: {
  orgId: string;
  actorUserId: string;
  userId: string;
  role: FraudLensRole;
}) {
  if (input.userId === input.actorUserId) {
    throw new Error(
      "Administrators cannot change their own FraudLens role from this console."
    );
  }
  assertNotBootstrapOwner(input.userId);
  await assertOrganizationMember(input.orgId, input.userId);

  const clerkUser = await clerkClient.users.getUser(input.userId);
  const email =
    clerkUser.emailAddresses.find(
      item => item.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? null;
  await upsertUser({
    openId: clerkUser.id,
    name: toDisplayName(clerkUser.firstName, clerkUser.lastName),
    email,
    loginMethod: "clerk",
    role: input.role,
  });

  const db = await getDb();
  if (!db)
    throw new Error(
      "A database connection is required to update FraudLens roles."
    );
  await db
    .update(users)
    .set({ role: input.role })
    .where(eq(users.openId, input.userId));
  return (await getUserByOpenId(input.userId)) ?? null;
}

export async function deactivateOrganizationMember(input: {
  orgId: string;
  actorUserId: string;
  userId: string;
}) {
  if (input.userId === input.actorUserId) {
    throw new Error(
      "Administrators cannot deactivate their own workspace membership from this console."
    );
  }
  assertNotBootstrapOwner(input.userId);
  const membership = await assertOrganizationMember(input.orgId, input.userId);
  await assertNotRemovingLastOrganizationAdministrator(
    input.orgId,
    membership,
    false
  );
  return clerkClient.organizations.deleteOrganizationMembership({
    organizationId: input.orgId,
    userId: input.userId,
  });
}

export async function revokeOrganizationInvitation(input: {
  orgId: string;
  actorUserId: string;
  invitationId: string;
}) {
  return clerkClient.organizations.revokeOrganizationInvitation({
    organizationId: input.orgId,
    invitationId: input.invitationId,
    requestingUserId: input.actorUserId,
  });
}

export async function revokeMemberSessions(input: {
  orgId: string;
  actorUserId: string;
  userId: string;
}) {
  if (input.userId === input.actorUserId) {
    throw new Error(
      "Administrators cannot revoke their own sessions from this console."
    );
  }
  await assertOrganizationMember(input.orgId, input.userId);
  const sessions = await clerkClient.sessions.getSessionList({
    userId: input.userId,
    limit: 100,
  });
  await Promise.all(
    sessions.data.map(session => clerkClient.sessions.revokeSession(session.id))
  );
  return { revokedCount: sessions.data.length };
}
