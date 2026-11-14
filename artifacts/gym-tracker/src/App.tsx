import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";
import { AuthProvider, ProfileGate } from "@/components/profile-gate";
import NotFound from "@/pages/not-found";

import { Redirect } from "wouter";
import TodayPage from "@/pages/today";
import PlansPage from "@/pages/plans";
import PlanFormPage from "@/pages/plan-form";
import SessionPage from "@/pages/session";
import HistoryPage from "@/pages/history";
import ProgressPage from "@/pages/progress";
import SessionDetailPage from "@/pages/session-detail";
import TrashPage from "@/pages/trash";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={TodayPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/plans/new" component={PlanFormPage} />
        <Route path="/plans/:id/edit" component={PlanFormPage} />
        <Route path="/progress" component={ProgressPage} />
        <Route path="/start">
          <Redirect to="/" />
        </Route>
        <Route path="/session/:id" component={SessionPage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/history/:id" component={SessionDetailPage} />
        <Route path="/trash" component={TrashPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProfileGate>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </ProfileGate>
        </AuthProvider>
        <Toaster />
    </QueryClientProvider>
  );
}

export default App;
