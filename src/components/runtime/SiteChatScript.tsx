"use client";

// Loads a firm's chat widget (pasted in Settings). Placement (desktop / mobile
// / content & FAQ) is chosen in the admin UI and applied here — not by editing
// data-show-when on the pasted snippet.

import { useEffect } from "react";
import {
  DEFAULT_SITE_CHAT_PLACEMENT,
  SITE_CHAT_FOOTER_ID,
  SITE_CHAT_LOCALE_EVENT,
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

function safeRemove(el: Element | null | undefined) {
  try {
    el?.remove();
  } catch {
    /* already gone — React and the vendor script both touch <body> */
  }
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

    let disposed = false;
    let stop: (() => void) | null = null;

    const start = () => {
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
      let footerInView = false;
      const deviceMode = () => (isMobile() ? placement.mobile : placement.desktop);
      const sync = () => {
        if (chatPanelOpen()) {
          setChatOn(true);
          return;
        }
        // The landing Call/Start strip sits in the same corner as the bubble.
        if (footerInView) {
          setChatOn(false);
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
      let footerIo: IntersectionObserver | null = null;
      const observe = () => {
        io?.disconnect();
        footerIo?.disconnect();
        visible.clear();
        footerInView = false;
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
        if (targets.length) {
          for (const t of targets) io.observe(t);
        } else {
          sync();
        }
        const footer = document.getElementById(SITE_CHAT_FOOTER_ID);
        if (footer) {
          footerIo = new IntersectionObserver(
            (entries) => {
              footerInView = entries.some((e) => e.isIntersecting);
              sync();
            },
            { threshold: 0 },
          );
          footerIo.observe(footer);
        }
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
      let hadFooter = Boolean(document.getElementById(SITE_CHAT_FOOTER_ID));
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement && node.hasAttribute("data-rjl-chat")) watchHost(node);
          }
        }
        const nextCount = sectionTargets().length;
        const nextFooter = Boolean(document.getElementById(SITE_CHAT_FOOTER_ID));
        if (nextCount !== sectionCount || nextFooter !== hadFooter) {
          sectionCount = nextCount;
          hadFooter = nextFooter;
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
        footerIo?.disconnect();
        shadowObservers.forEach((o) => o.disconnect());
        setChatOn(false);
        safeRemove(script);
        safeRemove(style);
        chatHosts().forEach((n) => safeRemove(n));
        try {
          delete (window as unknown as { __rjlChatLoaded?: boolean }).__rjlChatLoaded;
        } catch {
          /* ignore */
        }
      };
    };

    stop = start();

    const onLocale = () => {
      window.setTimeout(() => {
        if (disposed) return;
        stop?.();
        stop = start();
      }, 0);
    };
    window.addEventListener(SITE_CHAT_LOCALE_EVENT, onLocale);

    return () => {
      disposed = true;
      window.removeEventListener(SITE_CHAT_LOCALE_EVENT, onLocale);
      stop?.();
    };
  }, [src, clientId, placement.desktop, placement.mobile, placement.content, placement.faq]);

  return null;
}
