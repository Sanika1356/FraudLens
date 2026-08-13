import { RedirectToSignIn, SignIn, SignUp, useAuth } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AssessmentPage,
  CaseworkPage,
  CommandCenterPage,
  DriftPage,
  ModelHealthPage,
  TransactionDetailPage,
  TransactionsPage,
} from "@/pages/FraudLensPages";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function WorkspaceRouter() {
  return (
    <Switch>
      <Route path="/" component={CommandCenterPage} />
      <Route path="/transactions" component={TransactionsPage} />
      <Route path="/transactions/:id" component={TransactionDetailPage} />
      <Route path="/assess" component={AssessmentPage} />
      <Route path="/casework" component={CaseworkPage} />
      <Route path="/model-health" component={ModelHealthPage} />
      <Route path="/drift" component={DriftPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div className="min-h-screen bg-[#07111e]" aria-label="Loading FraudLens" />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return <WorkspaceRouter />;
}

function AuthenticationScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111e] px-4 py-10">
      {mode === "sign-in" ? (
        <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
      ) : (
        <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
      )}
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" />
          <Switch>
            <Route path="/sign-in"><AuthenticationScreen mode="sign-in" /></Route>
            <Route path="/sign-up"><AuthenticationScreen mode="sign-up" /></Route>
            <Route><ProtectedWorkspace /></Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
