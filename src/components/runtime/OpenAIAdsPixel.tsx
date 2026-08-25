"use client";

// Injects a firm's ChatGPT Ads Measurement Pixel on public journey pages.
// Snippet matches the loader used on the firm's other sites (oaiq queue +
// bzrcdn SDK). Pixel ID comes from Settings — not hardcoded. Conversion
// events are fired from the journey player via measureOpenAILead().

import Script from "next/script";

export function OpenAIAdsPixel({ pixelId }: { pixelId?: string }) {
  if (!pixelId) return null;
  return (
    <Script
      id="openai-ads-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");oaiq("init",{pixelId:${JSON.stringify(pixelId)},debug:true});`,
      }}
    />
  );
}

/** Fire lead_created when a journey/callback form completes. No-op if the pixel isn't loaded. */
export function measureOpenAILead(leadId: string): void {
  if (typeof window === "undefined" || !leadId) return;
  try {
    const oaiq = (window as unknown as { oaiq?: (...args: unknown[]) => void }).oaiq;
    if (typeof oaiq !== "function") return;
    oaiq("measure", "lead_created", { type: "customer_action" }, { event_id: leadId });
  } catch {
    /* pixel optional */
  }
}
