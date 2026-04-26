import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "@/components/ThemeToggle";
import SetupPage from "@/pages/SetupPage";
import RunListPage from "@/pages/RunListPage";
import CheckInPage from "@/pages/CheckInPage";
import OperationsPage from "@/pages/OperationsPage";
import StarterPage from "@/pages/StarterPage";
import FinishPage from "@/pages/FinishPage";
import ExceptionsPage from "@/pages/ExceptionsPage";
import ResultsPage from "@/pages/ResultsPage";
import LiveDisplayPage from "@/pages/LiveDisplayPage";
import AuditPage from "@/pages/AuditPage";
import MatchHubPage from "@/match/pages/MatchHubPage";
import SetupWizardPage from "@/match/pages/SetupWizardPage";
import RegistrationPage from "@/match/pages/RegistrationPage";
import RunTimingPage from "@/match/pages/RunTimingPage";
import StageTabletPage from "@/match/pages/StageTabletPage";
import ObstacleTabletPage from "@/match/pages/ObstacleTabletPage";
import MatchResultsPage from "@/match/pages/ResultsPage";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={SetupPage} />
      <Route path="/runlist" component={RunListPage} />
      <Route path="/checkin" component={CheckInPage} />
      <Route path="/ops" component={OperationsPage} />
      <Route path="/starter" component={StarterPage} />
      <Route path="/finish" component={FinishPage} />
      <Route path="/exceptions" component={ExceptionsPage} />
      <Route path="/results" component={ResultsPage} />
      <Route path="/display" component={LiveDisplayPage} />
      <Route path="/audit" component={AuditPage} />
      {/* Match (Phase 2) */}
      <Route path="/match" component={MatchHubPage} />
      <Route path="/match/setup/:id" component={SetupWizardPage} />
      <Route path="/match/registration/:id" component={RegistrationPage} />
      <Route path="/match/run/:id" component={RunTimingPage} />
      <Route path="/match/stage/:id" component={StageTabletPage} />
      <Route path="/match/obstacle/:id" component={ObstacleTabletPage} />
      <Route path="/match/results/:id" component={MatchResultsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
