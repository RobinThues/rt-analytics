// Same events and props as scripts/demo/dwd-profile.ts, so live events join the generated history.
export type DemoEvents = {
  place_selected: { source: "search" | "suggestion" | "ip"; place: string };
  subscribe_click: { target: "apple" | "google" | "outlook" | "copy"; place: string; fields: string };
};
