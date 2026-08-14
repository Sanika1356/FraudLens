import "./monitoring";
import * as Sentry from "@sentry/react";
import { ClerkProvider, useAuth } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { useMemo } from "react";
import superjson from "superjson";
import App from "./App";
import { captureClientException } from "./monitoring";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required to start FraudLens.");
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: error => captureClientException(error, "react_query_query"),
  }),
  mutationCache: new MutationCache({
    onError: error => captureClientException(error, "react_query_mutation"),
  }),
});

function AuthenticatedTrpcApp() {
  const { getToken } = useAuth();

  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            headers: async () => {
              const token = await getToken();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
            fetch(input, init) {
              return globalThis.fetch(input, {
                ...(init ?? {}),
                credentials: "include",
              });
            },
          }),
        ],
      }),
    [getToken],
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up">
    <AuthenticatedTrpcApp />
  </ClerkProvider>,
);
