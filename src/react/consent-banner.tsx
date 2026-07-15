import { useEffect, useState } from "react";
import { useAnalytics } from "./provider.js";
import type { ConsentState } from "../core/types.js";

export interface ConsentBannerProps {
  message?: string;
  acceptLabel?: string;
  declineLabel?: string;
  className?: string;
}

const DEFAULT_MESSAGE =
  "This site collects anonymous usage statistics. Allow a small identifier in your browser so returning visits can be recognized? No personal data is collected either way.";

export function ConsentBanner({
  message = DEFAULT_MESSAGE,
  acceptLabel = "Accept",
  declineLabel = "Decline",
  className,
}: ConsentBannerProps) {
  const analytics = useAnalytics();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ConsentState>("pending");

  useEffect(() => {
    setMounted(true);
    setState(analytics.getConsent());
    return analytics.onConsentChange(setState);
  }, [analytics]);

  if (!mounted || state !== "pending") return null;

  return (
    <div role="dialog" aria-label="Analytics consent" className={className ?? "rta-banner"}>
      <p className="rta-banner-message">{message}</p>
      <div className="rta-banner-actions">
        <button type="button" onClick={() => analytics.declineConsent()}>
          {declineLabel}
        </button>
        <button type="button" onClick={() => analytics.acceptConsent()}>
          {acceptLabel}
        </button>
      </div>
    </div>
  );
}
