"use client";
import { useAnalytics } from "rt-analytics/react";

export default function Home() {
  const analytics = useAnalytics<{ button_clicked: { label: string } }>();
  return (
    <main>
      <h1>rt-analytics playground</h1>
      <button onClick={() => analytics.track("button_clicked", { label: "demo" })}>Track event</button>
      <button onClick={() => analytics.identify("demo-user-1")}>Identify</button>
      <button onClick={() => analytics.reset()}>Reset</button>
      <button onClick={() => analytics.flush()}>Flush now</button>
    </main>
  );
}
