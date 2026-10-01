/* Botanical Editorial system: warm parchment canvas, forest ink, marigold actions, Fraunces display + DM Sans UI. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AnalyticsConsent from "./components/AnalyticsConsent";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Products from "./pages/Products";
import Experts from "./pages/Experts";
import Admin from "./pages/Admin";
import Checkout from "./pages/Checkout";
import Guidance from "./pages/Guidance";
import CareFinder from "./pages/CareFinder";
import FAQ from "./pages/FAQ";
import Account from "./pages/Account";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products" component={Products} />
      <Route path="/experts" component={Experts} />
      <Route path="/admin" component={Admin} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/guidance" component={Guidance} />
      <Route path="/care" component={CareFinder} />
      <Route path="/faq" component={FAQ} />
      <Route path="/account" component={Account} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="bottom-right" />
          <Router />
          <AnalyticsConsent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
