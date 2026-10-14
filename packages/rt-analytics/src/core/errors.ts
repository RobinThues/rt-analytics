type Report = (name: string, props: Record<string, unknown>) => void;

export function setupErrorCapture(report: Report): () => void {
  const onError = (e: ErrorEvent) =>
    report("$error", {
      message: String(e.message ?? "").slice(0, 500),
      source: e.filename || null,
      line: e.lineno ?? null,
    });
  const onRejection = (e: PromiseRejectionEvent) =>
    report("$error", {
      message: String(e.reason ?? "").slice(0, 500),
      source: "unhandledrejection",
      line: null,
    });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
