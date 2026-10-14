import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

type Report = (name: string, props: Record<string, unknown>) => void;

export function setupWebVitals(report: Report): void {
  const handler = (metric: Metric) =>
    report("$web_vital", { metric: metric.name, value: metric.value, rating: metric.rating });
  onCLS(handler);
  onINP(handler);
  onLCP(handler);
}
