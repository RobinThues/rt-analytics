"use client";

/** Reloads the current page (keeps path and query string). */
export function RetryButton() {
  return (
    <button type="button" className="underline" onClick={() => window.location.reload()}>
      Retry
    </button>
  );
}
