import { PageviewTracker } from "rt-analytics/next/client";
import { AnalyticsProvider, ConsentBanner } from "rt-analytics/react";
import { Nav } from "./nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider appId="demo">
          <PageviewTracker />
          <Nav />
          {children}
          <ConsentBanner />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
