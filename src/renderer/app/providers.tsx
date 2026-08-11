import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/shared/theme";
import { I18nProvider } from "@/shared/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

type ErrorBoundaryState = { crashed: boolean };

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed) {
      return (
        <main role="alert" className="grid min-h-screen place-items-center bg-background p-8">
          <div className="grid gap-3 rounded-lg border border-graphite bg-card p-10 shadow-[0_4px_32px_rgba(8,9,10,0.6)]">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-acid-lime">
              Application error
            </p>
            <h1 className="m-0 text-heading-sm font-w510 tracking-tightest text-paper">
              Buzz couldn't open this workspace.
            </h1>
            <p className="text-fog">Your saved data was not changed. Reload the application to try again.</p>
            <Button type="button" className="justify-self-start" onClick={() => window.location.reload()}>
              Reload application
            </Button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </AppErrorBoundary>
  );
}
