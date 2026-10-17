"use client";

/** Reloads the current page (keeps path and query string). */
export function RetryButton() {
  return (
    <button
      type="button"
      className="text-primary underline underline-offset-2"
      onClick={() => window.location.reload()}
    >
      Retry
    </button>
  );
}
