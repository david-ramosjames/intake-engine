// Injects a firm's CallRail Dynamic Number Insertion (swap.js) snippet on the
// public journey pages. This is call tracking: CallRail swaps the displayed
// phone number for a tracking number so calls are attributed to their source.
// Independent of the server-side form-submission integration. Renders nothing
// when call tracking isn't configured.

import Script from "next/script";

export function CallRailScript({ src }: { src?: string }) {
  if (!src) return null;
  return <Script id="callrail-swap" src={src} strategy="afterInteractive" />;
}
