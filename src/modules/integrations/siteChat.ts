// Per-business chat widget (RJL-Chat / site-chat). The admin pastes the
// vendor's <script> snippet; we extract the public URL + client id and inject
// the widget on landing pages. No secrets — same data-client-id the vendor
// puts in the page source.

export type SiteChatDeviceMode = "always" | "sections" | "off";

export interface SiteChatPlacement {
  desktop: SiteChatDeviceMode;
  mobile: SiteChatDeviceMode;
  content: boolean;
  faq: boolean;
}

export interface SiteChatConfig {
  // Original paste, so Settings can show what they saved.
  snippet?: string;
  src?: string;
  clientId?: string;
  placement?: SiteChatPlacement;
}

export const SITE_CHAT_CONTENT_ID = "ie-content-section";
export const SITE_CHAT_FAQ_ID = "ie-faq-section";
export const SITE_CHAT_FOOTER_ID = "ie-cta-footer";
/** Journey language toggle fires this after React commits so the widget can re-read ?lang=. */
export const SITE_CHAT_LOCALE_EVENT = "ie-site-chat-locale";

export const DEFAULT_SITE_CHAT_PLACEMENT: SiteChatPlacement = {
  desktop: "always",
  mobile: "sections",
  content: true,
  faq: true,
};

const DEVICE_MODES = new Set<SiteChatDeviceMode>(["always", "sections", "off"]);

export function normalizeSiteChatPlacement(raw: unknown): SiteChatPlacement {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = (v: unknown, fallback: SiteChatDeviceMode): SiteChatDeviceMode =>
    DEVICE_MODES.has(v as SiteChatDeviceMode) ? (v as SiteChatDeviceMode) : fallback;
  return {
    desktop: mode(o.desktop, DEFAULT_SITE_CHAT_PLACEMENT.desktop),
    mobile: mode(o.mobile, DEFAULT_SITE_CHAT_PLACEMENT.mobile),
    content: o.content !== false,
    faq: o.faq !== false,
  };
}

export function siteChatSectionIds(placement: SiteChatPlacement): string[] {
  const ids: string[] = [];
  if (placement.content) ids.push(SITE_CHAT_CONTENT_ID);
  if (placement.faq) ids.push(SITE_CHAT_FAQ_ID);
  return ids;
}

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

export function siteChatConfig(settings: Record<string, unknown> | undefined): SiteChatConfig | null {
  const c = settings?.siteChat;
  if (!c || typeof c !== "object") return null;
  return c as SiteChatConfig;
}

/** Normalize a widget.js URL to https. Undefined if it doesn't look like the chat widget. */
export function siteChatScriptUrl(raw: string | undefined): string | undefined {
  let url = raw?.trim();
  if (!url) return undefined;
  const srcMatch = url.match(/src\s*=\s*["']([^"']+)["']/i);
  if (srcMatch) url = srcMatch[1]!.trim();
  if (!/\bwidget\.js\b/i.test(url)) return undefined;
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  else if (!url.startsWith("https://")) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    if (!parsed.pathname.includes("widget.js")) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeClientId(raw: string | undefined): string | undefined {
  const id = raw?.trim();
  if (!id || !CLIENT_ID_RE.test(id)) return undefined;
  return id;
}

/**
 * Pull src + data-client-id out of a pasted <script> tag (or a bare widget.js
 * URL plus a client id attribute somewhere in the blob).
 */
export function parseSiteChatSnippet(raw: string | undefined): { src: string; clientId: string } | null {
  const text = raw?.trim();
  if (!text) return null;
  const src = siteChatScriptUrl(text);
  const idMatch = text.match(/data-client-id\s*=\s*["']([^"']+)["']/i);
  const clientId = sanitizeClientId(idMatch?.[1]);
  if (!src || !clientId) return null;
  return { src, clientId };
}

export type PublicSiteChat = {
  src: string;
  clientId: string;
  placement: SiteChatPlacement;
};

/** Public-safe payload for the journey runtime. Undefined when not configured. */
export function publicSiteChat(config: SiteChatConfig | null): PublicSiteChat | undefined {
  if (!config) return undefined;
  const fromSnippet = parseSiteChatSnippet(config.snippet);
  const src = fromSnippet?.src ?? siteChatScriptUrl(config.src);
  const clientId = fromSnippet?.clientId ?? sanitizeClientId(config.clientId);
  if (!src || !clientId) return undefined;
  const placement = normalizeSiteChatPlacement(config.placement);
  if (placement.desktop === "off" && placement.mobile === "off") return undefined;
  return { src, clientId, placement };
}
