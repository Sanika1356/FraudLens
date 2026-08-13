import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AssessmentPage, CaseworkPage, CommandCenterPage, DriftPage, ModelHealthPage, TransactionDetailPage, TransactionsPage } from "@/pages/FraudLensPages";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <Switch><Route path="/" component={CommandCenterPage} /><Route path="/transactions" component={TransactionsPage} /><Route path="/transactions/:id" component={TransactionDetailPage} /><Route path="/assess" component={AssessmentPage} /><Route path="/casework" component={CaseworkPage} /><Route path="/model-health" component={ModelHealthPage} /><Route path="/drift" component={DriftPage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster theme="dark" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
