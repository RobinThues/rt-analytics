"use client";
import { useState } from "react";
import { useAnalytics } from "rt-analytics/react";
import type { DemoEvents } from "../events";

const PLACES = ["Düsseldorf", "Köln", "Berlin"];
const TARGETS = ["apple", "google", "outlook", "copy"] as const;

export default function Home() {
  const analytics = useAnalytics<DemoEvents>();
  const [place, setPlace] = useState<string | null>(null);
  return (
    <main>
      <h1>rt-analytics demo</h1>
      <p>Pick a place, then subscribe. Events go to app_id &quot;demo&quot;.</p>
      {PLACES.map((p) => (
        <button
          key={p}
          onClick={() => {
            setPlace(p);
            analytics.track("place_selected", { source: "search", place: p });
          }}
        >
          {p}
        </button>
      ))}
      {place && (
        <div>
          {TARGETS.map((target) => (
            <button
              key={target}
              onClick={() => analytics.track("subscribe_click", { target, place, fields: "temp,rain" })}
            >
              Subscribe ({target})
            </button>
          ))}
        </div>
      )}
      <button onClick={() => analytics.flush()}>Flush now</button>
    </main>
  );
}
