"use client";

// Loads a firm's chat widget (pasted in Settings). Placement (desktop / mobile
// / content & FAQ) is chosen in the admin UI and applied here — not by editing
// data-show-when on the pasted snippet.

import { useEffect } from "react";
import {
  DEFAULT_SITE_CHAT_PLACEMENT,
  siteChatSectionIds,
  type SiteChatPlacement,
} from "@/modules/integrations/siteChat";

const HIDE_STYLE_ID = "ie-site-chat-hide";
const SCRIPT_ID = "site-chat-widget";
const ON_CLASS = "ie-chat-on";
const MOBILE_MQ = "(max-width: 768px)";

function chatHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-rjl-chat], [data-rjl-side-stack]"));
}

function chatPanelOpen(): boolean {
  for (const host of chatHosts()) {
    if (host.shadowRoot?.querySelector(".panel")) return true;
  }
  return false;
}

function isMobile(): boolean {
  try {
    return window.matchMedia(MOBILE_MQ).matches;
  } catch {
    return false;
  }
}

function setChatOn(on: boolean) {
  document.body.classList.toggle(ON_CLASS, on);
}

export function SiteChatScript({
  src,
  clientId,
  placement = DEFAULT_SITE_CHAT_PLACEMENT,
}: {
  src?: string;
  clientId?: string;
  placement?: SiteChatPlacement;
}) {
  useEffect(() => {
    if (!src || !clientId) return;

    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent =
      `body:not(.${ON_CLASS}) [data-rjl-chat], body:not(.${ON_CLASS}) [data-rjl-side-stack] {` +
      `visibility:hidden!important;pointer-events:none!important;}`;
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.setAttribute("data-client-id", clientId);
    script.setAttribute("data-open-on-load", "false");
    document.body.appendChild(script);

    const ids = siteChatSectionIds(placement);
    const visible = new Set<Element>();
    const deviceMode = () => (isMobile() ? placement.mobile : placement.desktop);
    const sync = () => {
      if (chatPanelOpen()) {
        setChatOn(true);
        return;
      }
      const mode = deviceMode();
      if (mode === "always") {
        setChatOn(true);
        return;
      }
      if (mode === "off") {
        setChatOn(false);
        return;
      }
      setChatOn(visible.size > 0);
    };

    const sectionTargets = () =>
      ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));

    let io: IntersectionObserver | null = null;
    const observe = () => {
      io?.disconnect();
      visible.clear();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) visible.add(e.target);
            else visible.delete(e.target);
          }
          sync();
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      const targets = sectionTargets();
      if (!targets.length) {
        sync();
        return;
      }
      for (const t of targets) io.observe(t);
    };
    observe();

    const shadowObservers: MutationObserver[] = [];
    const watchHost = (host: HTMLElement) => {
      const root = host.shadowRoot;
      if (!root) return;
      const smo = new MutationObserver(() => sync());
      smo.observe(root, { childList: true, subtree: true });
      shadowObservers.push(smo);
    };

    let sectionCount = sectionTargets().length;
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement && node.hasAttribute("data-rjl-chat")) watchHost(node);
        }
      }
      const nextCount = sectionTargets().length;
      if (nextCount !== sectionCount) {
        sectionCount = nextCount;
        observe();
      }
      sync();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    const mq = window.matchMedia(MOBILE_MQ);
    const onMq = () => sync();
    mq.addEventListener("change", onMq);

    return () => {
      mq.removeEventListener("change", onMq);
      mo.disconnect();
      io?.disconnect();
      shadowObservers.forEach((o) => o.disconnect());
      setChatOn(false);
      script.remove();
      style.remove();
      chatHosts().forEach((n) => n.remove());
      try {
        delete (window as unknown as { __rjlChatLoaded?: boolean }).__rjlChatLoaded;
      } catch {
        /* ignore */
      }
    };
  }, [src, clientId, placement.desktop, placement.mobile, placement.content, placement.faq]);

  return null;
}
