import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SignUp } from "./pages/SignUp";
import { SignIn } from "./pages/SignIn";
import { BoardsList } from "./pages/BoardsList";
import { BoardView } from "./pages/BoardView";
import { OrganisationsPage } from "./pages/OrganisationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DevComponents } from "./pages/DevComponents";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./components/AppShell";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";

// Phase 6 bundle-size check found @xyflow/react + dagre (graph-only
// dependencies) pulling the single JS bundle to 890KB — code-split just
// this one route rather than making everyone pay for the graph library
// on every page load when most sessions never open it.
const GraphView = lazy(() => import("./pages/GraphView").then((m) => ({ default: m.GraphView })));

function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignIn />} />
        {/* Phase A verification only — a throwaway gallery of every
            primitive and variant, screenshotted to catch visual bugs
            before they propagate into real pages. Not linked from
            anywhere in the real app nav. */}
        <Route path="/dev/components" element={<DevComponents />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<BoardsList />} />
            <Route path="/boards/:boardId" element={<BoardView />} />
            <Route
              path="/boards/:boardId/graph"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <GraphView />
                </Suspense>
              }
            />
            <Route path="/organisations" element={<OrganisationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
