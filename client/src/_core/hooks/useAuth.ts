import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";

export type FraudLensUser = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user";
};

/**
 * Returns the authenticated Clerk user in the shape expected by the FraudLens UI.
 * Application roles are introduced in the next authorization task.
 */
export function useAuth() {
  const { isLoaded: authLoaded, isSignedIn } = useClerkAuth();
  const { isLoaded: userLoaded, user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const user: FraudLensUser | null = clerkUser
    ? {
        id: clerkUser.id,
        openId: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || null,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
        role: "user",
      }
    : null;

  return {
    user,
    loading: !authLoaded || !userLoaded,
    error: null,
    isAuthenticated: Boolean(isSignedIn),
    refresh: async () => undefined,
    logout: async () => {
      await signOut({ redirectUrl: "/sign-in" });
    },
  };
}
