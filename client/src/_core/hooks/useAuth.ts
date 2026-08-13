import { useAuth as useClerkAuth, useClerk, useOrganization, useUser } from "@clerk/react";
import { trpc } from "@/lib/trpc";

export type FraudLensRole = "analyst" | "manager" | "admin";

export type FraudLensUser = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  role: FraudLensRole;
};

/**
 * Returns the authenticated Clerk user together with the server-authoritative
 * FraudLens role. Client role labels are never used as an authorization boundary.
 */
export function useAuth() {
  const { isLoaded: authLoaded, isSignedIn } = useClerkAuth();
  const { isLoaded: userLoaded, user: clerkUser } = useUser();
  const { isLoaded: organizationLoaded, organization, membership } = useOrganization();
  const { signOut } = useClerk();
  const profile = trpc.auth.me.useQuery(undefined, { enabled: Boolean(isSignedIn) });

  const user: FraudLensUser | null = clerkUser
    ? {
        id: clerkUser.id,
        openId: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || null,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
        role: profile.data?.role ?? "analyst",
      }
    : null;

  return {
    user,
    organization: organization ? {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      imageUrl: organization.imageUrl,
    } : null,
    orgRole: membership?.role ?? null,
    loading: !authLoaded || !userLoaded || !organizationLoaded || (Boolean(isSignedIn) && profile.isLoading),
    error: profile.error,
    isAuthenticated: Boolean(isSignedIn),
    refresh: async () => {
      await profile.refetch();
    },
    logout: async () => {
      await signOut({ redirectUrl: "/sign-in" });
    },
  };
}
