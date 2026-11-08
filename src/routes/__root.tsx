import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import refreshCss from "../site-refresh.css?inline";
import { reportLovableError } from "../lib/lovable-error-reporting";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wazee wa Betting TZ" },
      { name: "theme-color", content: "#f2f6f2" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="not-found">
      <h1>404</h1>
      <p>Ukurasa haujapatikana.</p>
      <Link to="/">Rudi mwanzo</Link>
    </div>
  ),
  errorComponent: ({ error, reset }: { error: Error; reset: () => void }) => (
    <ErrorPage error={error} reset={reset} />
  ),
});
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="sw">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: refreshCss }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "root" });
  }, [error]);
  return (
    <div className="not-found">
      <h1>Samahani</h1>
      <p>Ukurasa umepata hitilafu. Jaribu tena.</p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Jaribu tena
      </button>
    </div>
  );
}
