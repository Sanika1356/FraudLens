import { OrganizationList, RedirectToSignIn, SignIn, SignUp, useAuth, useOrganization } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AdministratorManagementPage,
  AuditLogPage,
  AssessmentPage,
  CaseQueuesPage,
  CommandCenterPage,
  DriftPage,
  ModelHealthPage,
  NotificationSettingsPage,
  ReportsPage,
  TransactionDetailPage,
  TransactionImportPage,
  TransactionsPage,
} from "@/pages/FraudLensPages";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function WorkspaceRouter() {
  return (
    <Switch>
      <Route path="/" component={CommandCenterPage} />
      <Route path="/transactions" component={TransactionsPage} />
      <Route path="/transactions/:id" component={TransactionDetailPage} />
      <Route path="/assess" component={AssessmentPage} />
      <Route path="/import" component={TransactionImportPage} />
      <Route path="/casework" component={CaseQueuesPage} />
      <Route path="/model-health" component={ModelHealthPage} />
      <Route path="/drift" component={DriftPage} />
      <Route path="/audit" component={AuditLogPage} />
      <Route path="/alerts" component={NotificationSettingsPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/team" component={AdministratorManagementPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function OrganizationSelectionScreen() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: organizationLoaded, organization } = useOrganization();

  if (!authLoaded || !organizationLoaded) {
    return <div className="min-h-screen bg-[#07111e]" aria-label="Loading organization workspaces" />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (organization) {
    return <Redirect to="/" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111e] px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">FraudLens workspace</p>
        <OrganizationList afterCreateOrganizationUrl="/" afterSelectOrganizationUrl="/" />
      </div>
    </main>
  );
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: organizationLoaded, organization } = useOrganization();

  if (!isLoaded || !organizationLoaded) {
    return <div className="min-h-screen bg-[#07111e]" aria-label="Loading FraudLens" />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (!organization) {
    return <Redirect to="/select-organization" />;
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
            <Route path="/sign-in/*"><AuthenticationScreen mode="sign-in" /></Route>
            <Route path="/sign-in"><AuthenticationScreen mode="sign-in" /></Route>
            <Route path="/sign-up/*"><AuthenticationScreen mode="sign-up" /></Route>
            <Route path="/sign-up"><AuthenticationScreen mode="sign-up" /></Route>
            <Route path="/select-organization"><OrganizationSelectionScreen /></Route>
            <Route><ProtectedWorkspace /></Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
