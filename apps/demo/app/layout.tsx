import { AnalyticsProvider, ConsentBanner } from "rt-analytics/react";
import { PageviewTracker } from "rt-analytics/next/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider appId="example">
          <PageviewTracker />
          {children}
          <ConsentBanner />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
