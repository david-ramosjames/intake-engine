"use client";

// The Journey Player — a branching, one-screen-at-a-time runtime.
//
//  • Single-choice questions AUTO-ADVANCE on click and can branch per option
//    (option.goTo). Multi-field screens use a Continue button. Back walks the
//    visited-screen history.
//  • Branding: optional side image (desktop) and logo, from the theme.
//  • Three ending types — success (it's a lead), referral (refer out), decline
//    (can't help) — each terminal, with call-to-action buttons (Call/Text/…).
//    The lead's outcome is recorded from whichever ending is reached.
//  • Bilingual: when the journey has >1 language, a toggle switches all text
//    instantly (translations resolved from definition.i18n).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Component, JourneyDefinition, Option, Page, StatItem } from "@/modules/journeys/domain/schema";
import { ctaHref } from "@/modules/journeys/domain/schema";
import { LANGUAGE_LABELS, localize, tk } from "@/modules/journeys/domain/i18n";
import { isComponentVisible, isTerminalType, resolveNext, type Answers } from "@/modules/journeys/runtime/engine";
import { Field } from "./fields";

interface Props {
  slug: string;
  definition: JourneyDefinition;
  attribution?: Record<string, string>;
}

type Outcome = "lead" | "referral" | "declined";

// Compact input types that can share a row two-up on wider screens. Longer
// inputs (long text, address, uploads) and all content/choice blocks stay
// full width. A field can opt out with props.full = true.
// Optional accent colors for a heading, one per line of its text (props.lineColors,
// index-aligned to the newline-separated content). It never changes the text —
// just tints individual lines.
function lineColors(c: Component): (string | undefined)[] | null {
  const raw = c.props?.lineColors;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((v) => (typeof v === "string" && v ? v : undefined));
}
// Render a heading's text; if per-line colors are set, tint each line.
function HeadingBody({ component, L }: { component: Component; L: Localize }) {
  const text = L(tk.content(component.id), component.content) ?? "";
  const colors = lineColors(component);
  if (!colors) return <>{text}</>;
  return (
    <>
      {text.split("\n").map((ln, i) => (
        <span key={i} className="block" style={colors[i] ? { color: colors[i] } : undefined}>
          {ln}
        </span>
      ))}
    </>
  );
}

const COMPACT_FIELDS = new Set<Component["type"]>([
  "shortText",
  "email",
  "phone",
  "number",
  "currency",
  "date",
  "time",
]);

// Capture attribution/source context from the browser at submit time.
function collectContext(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ctx: Record<string, string> = {
    pageUrl: window.location.href,
    landingPage: window.location.href,
    referrer: document.referrer || "",
    userAgent: navigator.userAgent,
  };
  const params = new URL(window.location.href).searchParams;
  // Ad attribution: UTMs plus click ids (gclid for Google Ads, etc.). These
  // flow through to integrations like CallRail for conversion attribution.
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "msclkid",
  ]) {
    const v = params.get(k);
    if (v) ctx[k] = v;
  }
  return ctx;
}

export function JourneyPlayer({ slug, definition, attribution }: Props) {
  const pages = definition.pages;
  const theme = definition.theme ?? {};
  const firstId = pages[0]?.id ?? "";
  const languages = definition.languages && definition.languages.length ? definition.languages : ["en"];

  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<string[]>([firstId]);
  const [locale, setLocale] = useState<string>(languages[0]!);
  const [error, setError] = useState<string | null>(null);
  // The desktop callback card has its own error slot so a card validation
  // message shows only at the card, not also in the main CTA error line.
  const [cbError, setCbError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when a lead submits successfully but the journey defines no ending page
  // to land on — guarantees the visitor sees a thank-you, never the start form.
  const [forcedDone, setForcedDone] = useState(false);
  const submittedRef = useRef(false);
  const sessionRef = useRef<string>("");
  const startedRef = useRef(false);

  // Push a Google Tag Manager dataLayer event. These are the stable event names
  // a firm's GTM container triggers on (see the Settings → Tag Manager list):
  //   consult_flow_open, consult_flow_complete, consult_flow_phone_click,
  //   form_submission (plus consult_flow_start).
  const pushDataLayer = useCallback(
    (event: string, extra?: Record<string, unknown>) => {
      if (typeof window === "undefined") return;
      try {
        const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
        w.dataLayer = w.dataLayer || [];
        w.dataLayer.push({ event, journey: slug, ...extra });
      } catch {
        /* dataLayer optional */
      }
    },
    [slug],
  );

  // Fire-and-forget funnel event — recorded server-side AND surfaced to GTM.
  const emit = useCallback(
    (type: "opened" | "started" | "completed" | "cta_click", extra?: Record<string, string>) => {
      if (typeof window === "undefined" || !sessionRef.current) return;
      const gtmEvent =
        type === "opened"
          ? "consult_flow_open"
          : type === "started"
            ? "consult_flow_start"
            : type === "completed"
              ? "consult_flow_complete"
              : null;
      if (gtmEvent) pushDataLayer(gtmEvent, extra);
      try {
        void fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            org: attribution?.org,
            slug,
            sessionId: sessionRef.current,
            type,
            source: attribution?.source,
            pageUrl: window.location.href,
            ...extra,
          }),
        }).catch(() => {});
      } catch {
        /* best-effort */
      }
    },
    [slug, attribution, pushDataLayer],
  );

  // A tap on the call button on the ending / thank-you screen only. In-flow
  // call buttons (banner, landing CTA, sticky bar) record the server beacon but
  // do NOT fire consult_flow_phone_click, so it stays an end-of-journey signal.
  const trackPhoneClick = useCallback(() => {
    pushDataLayer("consult_flow_phone_click");
    emit("cta_click");
  }, [pushDataLayer, emit]);
  // A submit of the landing-page quick callback form.
  const trackFormSubmit = useCallback(() => {
    pushDataLayer("form_submission");
  }, [pushDataLayer]);

  // One session id per visitor+journey; record "opened" once on mount.
  useEffect(() => {
    let sid = "";
    try {
      const key = `ie_sid_${slug}`;
      sid = sessionStorage.getItem(key) ?? "";
      if (!sid) {
        sid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
        sessionStorage.setItem(key, sid);
      }
    } catch {
      sid = Math.random().toString(36).slice(2);
    }
    sessionRef.current = sid;
    emit("opened");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markStarted() {
    if (!startedRef.current) {
      startedRef.current = true;
      emit("started");
    }
  }

  const currentId = history[history.length - 1] ?? firstId;
  const page = pages.find((p) => p.id === currentId) ?? pages[0];
  const terminalPage = page && isTerminalType(page.type) ? page : null;
  const terminal = Boolean(terminalPage) || forcedDone;

  // Localized-text resolver bound to the current locale.
  const L = useCallback(
    (key: string, fallback: string | undefined) => localize(definition, locale, key, fallback),
    [definition, locale],
  );

  const pageById = useCallback((id: string) => pages.find((p) => p.id === id), [pages]);

  const submit = useCallback(
    async (ans: Answers, endingType?: string): Promise<Outcome | null> => {
      if (submittedRef.current) return null;
      submittedRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/leads`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, answers: ans, attribution, endingType, context: collectContext() }),
        });
        const data = (await res.json()) as { ok: boolean; outcome?: Outcome; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong.");
        const outcome = data.outcome ?? "lead";
        emit("completed", { outcome });
        return outcome;
      } catch (e) {
        submittedRef.current = false;
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [slug, attribution, emit],
  );

  const goTo = useCallback(
    (id: string, ans: Answers) => {
      setHistory((h) => [...h, id]);
      const target = pageById(id);
      if (target && isTerminalType(target.type)) void submit(ans, target.type);
    },
    [pageById, submit],
  );

  // Submit the lead and land on the journey's ending screen; if the journey
  // defines none, force a built-in thank-you rather than dropping the visitor
  // back on a form. Returns false when the submit itself failed.
  const finishLead = useCallback(
    async (ans: Answers): Promise<boolean> => {
      const outcome = await submit(ans);
      if (!outcome) return false;
      const wantType = outcome === "referral" ? "referral" : outcome === "declined" ? "decline" : "success";
      const end =
        pages.find((p) => p.type === wantType) ??
        pages.find((p) => p.type === "end") ??
        pages.find((p) => isTerminalType(p.type));
      if (end) setHistory((h) => [...h, end.id]);
      else setForcedDone(true);
      return true;
    },
    [submit, pages],
  );

  const advance = useCallback(
    async (from: Page, ans: Answers, optionGoTo?: string) => {
      const target = resolveNext(definition, from.id, ans, optionGoTo);
      if (target == null) {
        await finishLead(ans);
        return;
      }
      goTo(target, ans);
    },
    [definition, finishLead, goTo],
  );

  const back = () => {
    setError(null);
    submittedRef.current = false;
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  };

  const inputs = (page?.components ?? []).filter((c) => c.key && !isTerminalType(page!.type));
  const soleChoice =
    inputs.length === 1 && (inputs[0]!.type === "singleSelect" || inputs[0]!.type === "radio") ? inputs[0]! : null;

  function selectOption(component: Component, opt: Option) {
    markStarted();
    const next = { ...answers, [component.key!]: opt.value };
    setAnswers(next);
    void advance(page!, next, opt.goTo);
  }

  function set(key: string, value: unknown) {
    markStarted();
    setAnswers((a) => ({ ...a, [key]: value }));
    setError(null);
    setCbError(null);
  }

  function onContinue() {
    if (!page) return;
    // Clicking Start / Continue counts as starting the flow (fires
    // consult_flow_start once), even if the visitor typed nothing first.
    markStarted();
    for (const c of page.components) {
      if (
        c.key &&
        c.validation?.required &&
        deviceMatches(c, isMobile) &&
        isComponentVisible(c, definition, answers)
      ) {
        const v = answers[c.key];
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          setError(`Please answer: ${L(tk.label(c.id), c.label) || c.key}`);
          return;
        }
      }
    }
    void advance(page, answers);
  }

  const styleVars = useMemo(() => {
    const bg = theme.colorBackground ?? "#ffffff";
    const text = theme.colorText ?? "#0b1f3a";
    const surface = theme.colorSurface ?? bg;
    return {
      ["--acc"]: theme.colorAccent ?? "#e63946",
      ["--bg"]: bg,
      ["--surface"]: surface,
      ["--text"]: text,
      ["--radius"]: theme.radius ?? "9999px",
      // Answer buttons — explicit tokens, else inverse-contrast defaults.
      ["--btn-bg"]: theme.buttonBg ?? surface,
      ["--btn-text"]: theme.buttonText ?? text,
      ["--btn-hover-bg"]: theme.buttonHoverBg ?? text,
      ["--btn-hover-text"]: theme.buttonHoverText ?? bg,
      // Primary (filled call) button — its own color, else Button color, else
      // accent so older journeys are unchanged.
      ["--cta-bg"]: theme.ctaPrimaryBg ?? theme.buttonBg ?? theme.colorAccent ?? "#e63946",
      ["--cta-text"]: theme.ctaPrimaryText ?? theme.buttonText ?? "#ffffff",
      ["--cta-hover-bg"]: theme.buttonHoverBg ?? text,
      ["--cta-hover-text"]: theme.buttonHoverText ?? bg,
      // Secondary (outlined "start") button — border + text color, plus its
      // hover fill/text (defaults to filling with its own border color).
      ["--cta2"]: theme.ctaSecondaryColor ?? theme.colorAccent ?? text,
      ["--cta2-hover"]: theme.ctaSecondaryHoverBg ?? theme.ctaSecondaryColor ?? theme.colorAccent ?? text,
      ["--cta2-hover-text"]: theme.ctaSecondaryHoverText ?? bg,
    } as React.CSSProperties;
  }, [theme]);

  const firm = attribution?.firm ?? "";
  // The top bar hosts the language toggle (and, when opted in, the logo). The
  // in-form header only renders what's left over — and disappears entirely when
  // both live in the bar, giving the form more room.
  const showBanner = bannerShown(theme);
  const logoInBar = bannerLogoShown(theme);
  const logoInHeader = !logoInBar && Boolean(theme.logoUrl || firm);
  const toggleInHeader = !showBanner && languages.length > 1;
  const showHeader = logoInHeader || toggleInHeader;

  // App-onboarding treatment on phones: the first (landing) screen shows the
  // attorney photo as an edge-to-edge hero with the content floating over it.
  const isLanding = !terminal && history.length <= 1;
  const mobileHero = isLanding && Boolean(theme.sideImageUrl);
  // Hero framing (position + zoom). The mobile hero and the desktop side image
  // are framed independently so tuning the phone crop never shifts the desktop
  // photo. Desktop falls back to a neutral centered crop when unset.
  const heroBgStyle: React.CSSProperties = {
    backgroundImage: theme.sideImageUrl ? `url("${theme.sideImageUrl}")` : undefined,
    backgroundPosition: theme.heroPosition ?? "50% 35%",
    backgroundSize: theme.heroScale && theme.heroScale > 1 ? `${theme.heroScale * 100}%` : "cover",
  };
  const heroBgStyleDesktop: React.CSSProperties = {
    backgroundImage: theme.sideImageUrl ? `url("${theme.sideImageUrl}")` : undefined,
    backgroundPosition: theme.heroPositionDesktop ?? "50% 30%",
    backgroundSize:
      theme.heroScaleDesktop && theme.heroScaleDesktop > 1 ? `${theme.heroScaleDesktop * 100}%` : "cover",
  };
  // Side-image overlay text, localized (theme-level, keyed for i18n).
  const overlay = theme.sideOverlay;
  const overlayTitle = overlay?.title ? L(tk.overlayTitle(), overlay.title) : undefined;
  const overlaySubtitle = overlay?.subtitle ? L(tk.overlaySubtitle(), overlay.subtitle) : undefined;
  const heroMessage = overlay?.message ? L(tk.overlayMessage(), overlay.message) : undefined;

  // Sticky bottom CTA appears once the primary button scrolls out of view, and
  // hides again near the very bottom so it never overlaps the real CTAs (e.g.
  // the repeated Call/Start buttons at the end of the below-the-fold area).
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const y = window.scrollY;
      const nearBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 160;
      setShowSticky(y > 240 && !nearBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Track viewport so device-scoped fields (e.g. a desktop-only form) aren't
  // validated on the device where they're hidden.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Trust stats render at the bottom (under the CTAs); everything else on top.
  const visibleComps = (page?.components ?? []).filter((c) => isComponentVisible(c, definition, answers));
  const statsComps = visibleComps.filter((c) => c.type === "stats");
  const contentComps = visibleComps.filter((c) => c.type !== "stats");
  // Content can render above (default) or below (props.below) the action buttons.
  const mainComps = contentComps.filter((c) => c.props?.below !== true);
  const belowComps = contentComps.filter((c) => c.props?.below === true);
  // Below-the-actions inputs form the desktop "quick callback" card; any other
  // below content renders normally under it.
  const belowFields = belowComps.filter((c) => Boolean(c.key));
  const belowOther = belowComps.filter((c) => !c.key);
  // The callback card shows when the page has explicit "below" fields, OR when
  // it's simply turned on (theme.callback.enabled) on the landing screen — in
  // which case a default name / phone / email / message set is used.
  const es = locale === "es";
  const defaultCallbackFields: Component[] = [
    { id: "cb-name", type: "shortText", key: "full_name", label: es ? "Tu nombre" : "Your name", validation: { required: true } },
    { id: "cb-phone", type: "phone", key: "phone", label: es ? "Número de teléfono" : "Phone number", validation: { required: true } },
    { id: "cb-email", type: "email", key: "email", label: es ? "Correo electrónico (opcional)" : "Email address (optional)" },
    { id: "cb-msg", type: "longText", key: "description", label: es ? "¿Cómo podemos ayudarte?" : "How can we help?" },
  ];
  const callbackFields =
    belowFields.length > 0
      ? belowFields
      : theme.callback?.enabled && isLanding && !terminal
        ? defaultCallbackFields
        : [];
  // On the mobile hero, the page's main headline overlays the bottom of the
  // photo (the name moves up to the top-left). On desktop it stays in content.
  const heroHeading = mobileHero
    ? mainComps.find((c) => c.type === "heading" && c.props?.level !== 2)
    : undefined;
  const continueText = busy
    ? locale === "es"
      ? "Enviando…"
      : "Submitting…"
    : page?.type === "review"
      ? locale === "es"
        ? "Enviar"
        : "Submit"
      : L(tk.continue(page?.id ?? ""), page?.continueLabel) || (locale === "es" ? "Continuar" : "Continue");
  const continueSubtitle = L(tk.continueSubtitle(page?.id ?? ""), page?.continueSubtitle) || undefined;

  // The page's call CTA powers the sticky mobile bar (tap-to-call). Falls back
  // to the banner phone when the page has no explicit call button.
  const callCtaIndex = page?.cta?.findIndex((c) => isCallCta(c)) ?? -1;
  const pageCallCta = callCtaIndex >= 0 ? page!.cta![callCtaIndex] : undefined;
  const bannerPhone = theme.banner?.phone;
  const stickyCallHref = pageCallCta
    ? ctaHref(pageCallCta)
    : bannerPhone
      ? `tel:${bannerPhone.replace(/[^\d+]/g, "")}`
      : undefined;
  const stickyCallLabel = pageCallCta
    ? L(tk.cta(page!.id, callCtaIndex), pageCallCta.label)
    : theme.banner?.phoneLabel || (locale === "es" ? "Llamar ahora" : "Call Now");

  return (
    <main
      style={{
        ...styleVars,
        background: theme.colorBackground ?? "#ffffff",
        color: theme.colorText ?? "#0b1f3a",
        fontFamily: theme.fontFamily,
      }}
      className="flex flex-col"
    >
      {/* Above-the-fold fills the screen exactly as before; optional sections
          (FAQ / reviews) append below this wrapper on the landing screen. */}
      <div className="flex min-h-dvh flex-col">
      <Banner
        theme={theme}
        L={L}
        onCtaClick={() => emit("cta_click")}
        languages={languages}
        locale={locale}
        setLocale={setLocale}
        logoMobileHidden={mobileHero}
      />
      <div className="flex flex-1 flex-col md:flex-row">
      {theme.sideImageUrl && (
        <aside className="relative hidden bg-center md:block md:w-[38%] lg:w-[40%]" style={heroBgStyleDesktop}>
          {/* Cinematic edge blend — the photo dissolves left→right into the page
              background so the seam between the image and the content reads like
              a movie poster, not a hard column split. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, transparent 82%, color-mix(in srgb, var(--bg) 60%, transparent) 93%, var(--bg) 100%)",
            }}
          />
          {overlay &&
            (overlayTitle || overlaySubtitle || heroMessage || overlay.bullets?.length) && (
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent p-8 text-white lg:p-10">
                {overlayTitle && (
                  <div className="text-[1.65rem] font-semibold lg:text-[2.05rem]">{overlayTitle}</div>
                )}
                {overlaySubtitle && (
                  <div className="mt-1 text-[1.1rem] text-white/80">{overlaySubtitle}</div>
                )}
                {heroMessage && (
                  <div className="mt-3 border-l-2 border-[color:var(--acc)] pl-3 text-[0.95rem] leading-snug text-white/90">
                    {heroMessage}
                  </div>
                )}
                {overlay.bullets && overlay.bullets.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {overlay.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[0.95rem] text-white/90">
                        <span className="mt-0.5 text-amber-400" aria-hidden>
                          ★
                        </span>
                        {L(tk.overlayBullet(i), b)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
        </aside>
      )}

      {/* Mobile hero — attorney photo with the logo and name over it; it fades
          into the page so the content flows on one surface (no floating card). */}
      {mobileHero && (
        <div className="relative h-[56dvh] w-full shrink-0 overflow-hidden md:hidden">
          <div className="absolute inset-0 animate-hero-zoom bg-center" style={heroBgStyle} />
          {/* Left scrim for the name — darkens the left, fully clear before the
              center so the attorney's face (right) is never covered. */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 30%, transparent 56%)",
            }}
          />
          {/* Bottom scrim for the headline + message. */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 24%, transparent 46%)",
            }}
          />
          {/* Cinematic dissolve — the photo melts into the page background below
              (var(--bg)) so the hero flows into the content like a movie poster,
              never a hard cut. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
            style={{
              background:
                "linear-gradient(to top, var(--bg) 8%, color-mix(in srgb, var(--bg) 60%, transparent) 42%, transparent 100%)",
            }}
          />
          {theme.logoUrl && (
            <div className="absolute left-5 top-4">
              <LogoOrName logoUrl={theme.logoUrl} logoLink={theme.logoLink} firm="" inBar />
            </div>
          )}
          {/* Attorney name/details — upper-left, below the logo, ~1/3 wide. */}
          {(overlayTitle || overlaySubtitle) && (
            <div
              className="absolute left-6 max-w-[42%] text-white drop-shadow"
              style={{ top: `${theme.heroNameYMobile ?? 22}%` }}
            >
              {overlayTitle && <div className="text-2xl font-bold leading-tight">{overlayTitle}</div>}
              {overlaySubtitle && (
                <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80">
                  {overlaySubtitle}
                </div>
              )}
            </div>
          )}
          {/* Welcome headline + extra message — bottom of the photo. */}
          {(heroHeading || heroMessage) && (
            <div className="absolute inset-x-0 bottom-5 px-6 text-white drop-shadow">
              {heroHeading && (
                <h1 className="whitespace-pre-line text-3xl font-bold leading-tight">
                  <HeadingBody component={heroHeading} L={L} />
                </h1>
              )}
              {heroMessage && (
                <p className="mt-2.5 border-l-2 border-[color:var(--acc)] pl-3 text-sm leading-snug text-white/90">
                  {heroMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <section
        className={`relative flex flex-1 flex-col px-6 py-6 md:px-14 md:py-3 ${
          mobileHero ? "z-10 animate-card-rise -mt-1 pt-0 md:mt-0 md:animate-none md:pt-6" : ""
        }`}
      >
        {showHeader && (
          <header className={`flex ${logoInHeader ? "h-16" : "h-11"} shrink-0 items-center justify-between gap-3`}>
            {logoInHeader ? <LogoOrName logoUrl={theme.logoUrl} logoLink={theme.logoLink} firm={firm} /> : <span />}
            {toggleInHeader && (
              <LangToggle languages={languages} locale={locale} setLocale={setLocale} className="ml-auto" />
            )}
          </header>
        )}

        <div
          className={`mx-auto flex w-full max-w-2xl flex-1 flex-col py-4 md:py-2 md:justify-center ${
            mobileHero ? "justify-start pt-0" : "justify-center"
          }`}
        >
          {terminal ? (
            terminalPage ? (
              <EndingView page={terminalPage} L={L} onCtaClick={() => emit("cta_click")} onPhoneClick={trackPhoneClick} />
            ) : (
              <FallbackEnding locale={locale} />
            )
          ) : (
            <div key={page?.id} className="animate-fade-up space-y-4 md:space-y-3">
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 md:gap-y-3">
                {mainComps.map((c) => {
                  const isChoice = soleChoice && c.id === soleChoice.id;
                  // Compact inputs (name, phone, email…) share a row two-up on
                  // wider screens; everything else spans the full width. A field
                  // can force full width with props.full.
                  const half = !isChoice && COMPACT_FIELDS.has(c.type) && c.props?.full !== true;
                  const heroMoved = c.id === heroHeading?.id ? "hidden md:block" : "";
                  return (
                    <div key={c.id} className={`${half ? "" : "sm:col-span-2"} ${deviceClass(c)} ${heroMoved}`}>
                      {isChoice ? (
                        <ChoiceGrid component={c} L={L} onSelect={(o) => selectOption(c, o)} disabled={busy} />
                      ) : (
                        <ContentOrField
                          component={c}
                          answers={answers}
                          definition={definition}
                          L={L}
                          onChange={(v) => c.key && set(c.key, v)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {error && <p className="text-sm text-[color:var(--acc)]">{error}</p>}

              {/* Call CTA sits above the primary intake button (the call is the
                  top action), both full-width and the same size on every
                  screen. */}
              <div className="space-y-3">
                <div className="flex flex-col gap-3">
                  {page && <CtaButtons page={page} L={L} onCtaClick={() => emit("cta_click")} />}
                  {!soleChoice && (
                    <ActionButton
                      as="button"
                      onClick={onContinue}
                      disabled={busy}
                      variant={continueSubtitle ? "outline" : "primary"}
                      icon={continueSubtitle ? <ChatIcon /> : undefined}
                      title={continueText}
                      subtitle={continueSubtitle}
                    />
                  )}
                </div>
                {history.length > 1 && (
                  <button
                    type="button"
                    onClick={back}
                    className="rounded-[var(--radius)] px-1 py-1 text-sm opacity-60 transition hover:opacity-100 focus-ring"
                  >
                    ← {locale === "es" ? "Atrás" : "Back"}
                  </button>
                )}
              </div>

              {/* Content marked to render below the actions. Input fields become
                  the desktop "quick callback" card; anything else falls through
                  to the normal renderer. */}
              {callbackFields.length > 0 && (
                <CallbackCard
                  fields={callbackFields}
                  answers={answers}
                  definition={definition}
                  theme={theme}
                  L={L}
                  error={cbError}
                  onField={(key, v) => set(key, v)}
                  onSubmit={() => {
                    // "Request callback" is an explicit completion: validate the
                    // card's own fields, then submit the lead and go straight to
                    // the thank-you — never route into further journey steps.
                    markStarted();
                    for (const c of callbackFields) {
                      if (!c.key || !c.validation?.required) continue;
                      const v = answers[c.key];
                      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
                        setCbError(`Please answer: ${L(tk.label(c.id), c.label) || c.key}`);
                        return;
                      }
                    }
                    setCbError(null);
                    trackFormSubmit();
                    void finishLead(answers);
                  }}
                  busy={busy}
                />
              )}
              {belowOther.map((c) => (
                <div key={c.id} className={deviceClass(c)}>
                  <ContentOrField
                    component={c}
                    answers={answers}
                    definition={definition}
                    L={L}
                    onChange={(v) => c.key && set(c.key, v)}
                  />
                </div>
              ))}

              {/* Trust metrics card under the CTAs. */}
              {statsComps.map((c) => (c.stats ? <StatsBar key={c.id} stats={c.stats} /> : null))}
            </div>
          )}
        </div>
      </section>
      </div>
      </div>

      {/* Optional below-the-fold content on the landing screen only. Does not
          affect the full-screen above-the-fold layout. */}
      {isLanding && !terminal && (
        <BelowFold
          theme={theme}
          L={L}
          cta={
            theme.belowFold?.showCta ? (
              <>
                {page && <CtaButtons page={page} L={L} onCtaClick={() => emit("cta_click")} />}
                {!soleChoice && (
                  <ActionButton
                    as="button"
                    onClick={() => {
                      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                      onContinue();
                    }}
                    disabled={busy}
                    variant={continueSubtitle ? "outline" : "primary"}
                    icon={continueSubtitle ? <ChatIcon /> : undefined}
                    title={continueText}
                    subtitle={continueSubtitle}
                  />
                )}
              </>
            ) : undefined
          }
        />
      )}

      {/* Sticky bottom call bar on phones — a tap-to-call button stays a thumb
          away once the top actions scroll off. Pinned flush to the bottom edge
          (only the device safe-area is added below the button). */}
      {!terminal && showSticky && stickyCallHref && (
        <div
          className="animate-bar-up fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-3 backdrop-blur md:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <a
            href={stickyCallHref}
            onClick={() => emit("cta_click")}
            className="j-cta j-cta-primary flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-[var(--radius)] text-lg font-semibold focus-ring"
          >
            <PhoneIcon />
            {stickyCallLabel}
          </a>
        </div>
      )}
    </main>
  );
}

// Inline SVG flags — reliable everywhere (emoji flags don't render on Windows).
function Flag({ code }: { code: string }) {
  const cls = "h-3.5 w-5 shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10";
  if (code === "es") {
    // Mexico (green / white / red vertical tricolor).
    return (
      <svg viewBox="0 0 24 16" className={cls} aria-hidden>
        <rect width="8" height="16" fill="#006847" />
        <rect x="8" width="8" height="16" fill="#ffffff" />
        <rect x="16" width="8" height="16" fill="#ce1126" />
      </svg>
    );
  }
  // default: United States
  return (
    <svg viewBox="0 0 24 16" className={cls} aria-hidden>
      <rect width="24" height="16" fill="#fff" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} y={(i * 16) / 6.5} width="24" height={16 / 13} fill="#b22234" />
      ))}
      <rect width="10" height={(16 / 13) * 7} fill="#3c3b6e" />
    </svg>
  );
}

function LogoOrName({
  logoUrl,
  logoLink,
  firm,
  inBar,
}: {
  logoUrl?: string;
  logoLink?: string;
  firm: string;
  inBar?: boolean;
}) {
  const imgCls = inBar ? "max-h-[3.6rem] w-auto object-contain md:max-h-[4.2rem]" : "max-h-14 w-auto object-contain md:max-h-16";
  const inner = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={firm || "logo"} className={imgCls} />
  ) : firm ? (
    <span className="text-2xl font-semibold md:text-3xl">{firm}</span>
  ) : null;
  if (!inner) return null;
  return logoLink ? (
    <a href={logoLink} target="_blank" rel="noopener noreferrer" className="transition hover:opacity-80">
      {inner}
    </a>
  ) : (
    inner
  );
}

// EN/ES language pills. Used in the top bar (when shown) or the in-form header.
function LangToggle({
  languages,
  locale,
  setLocale,
  className,
  compact,
}: {
  languages: string[];
  locale: string;
  setLocale: (l: string) => void;
  className?: string;
  compact?: boolean;
}) {
  if (languages.length <= 1) return null;
  const abbr = (l: string) => (LANGUAGE_LABELS[l] ?? l).slice(0, 2).toUpperCase();
  // The language you'd switch to next (used for the compact single button on
  // mobile — showing only the *other* language keeps it big and tappable).
  const idx = Math.max(0, languages.indexOf(locale));
  const next = languages[(idx + 1) % languages.length]!;
  const pad = compact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-2 px-3.5 py-1.5 text-sm";
  return (
    <div className={`flex items-center ${className ?? ""}`}>
      {/* Mobile: a single, larger "switch to the other language" button. */}
      <button
        type="button"
        onClick={() => setLocale(next)}
        aria-label={`Switch to ${LANGUAGE_LABELS[next] ?? next}`}
        className="flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,currentColor_28%,transparent)] px-3 py-1.5 text-sm font-medium normal-case transition hover:bg-[color:color-mix(in_srgb,currentColor_12%,transparent)] sm:hidden"
      >
        <Flag code={next} />
        {abbr(next)}
      </button>
      {/* Desktop: the full toggle showing every language. */}
      <div className={`hidden items-center gap-1 font-medium normal-case sm:flex ${compact ? "opacity-80" : ""}`}>
        {languages.map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLocale(lng)}
            aria-pressed={locale === lng}
            className={`flex items-center rounded-full border transition ${pad} ${
              locale === lng
                ? "border-transparent bg-[color:color-mix(in_srgb,currentColor_16%,transparent)]"
                : "border-[color:color-mix(in_srgb,currentColor_22%,transparent)] opacity-70 hover:opacity-100"
            }`}
          >
            <Flag code={lng} />
            {abbr(lng)}
          </button>
        ))}
      </div>
    </div>
  );
}

type Localize = (key: string, fallback: string | undefined) => string;

function ChoiceGrid({
  component,
  L,
  onSelect,
  disabled,
}: {
  component: Component;
  L: Localize;
  onSelect: (opt: Option) => void;
  disabled?: boolean;
}) {
  const label = L(tk.label(component.id), component.label);
  const help = L(tk.help(component.id), component.helpText);
  return (
    <div className="space-y-6">
      {label && <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{label}</h1>}
      {help && <p className="text-lg opacity-70">{help}</p>}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {component.options?.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt)}
            className="j-option rounded-[var(--radius)] px-6 py-4 text-center text-lg font-medium shadow-sm focus-ring disabled:opacity-50"
          >
            {L(tk.option(component.id, opt.value), opt.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContentOrField({
  component,
  answers,
  definition,
  L,
  onChange,
}: {
  component: Component;
  answers: Answers;
  definition: JourneyDefinition;
  L: Localize;
  onChange: (v: unknown) => void;
}) {
  switch (component.type) {
    case "heading": {
      // A level-2 heading is a compact "question" prompt above a field group —
      // smaller than the page headline. Text may be plain or colored lines.
      if (component.props?.level === 2) {
        return (
          <h2 className="whitespace-pre-line text-lg font-semibold leading-snug sm:text-xl">
            <HeadingBody component={component} L={L} />
          </h2>
        );
      }
      return (
        <h1 className="whitespace-pre-line text-2xl font-semibold leading-tight sm:text-3xl">
          <HeadingBody component={component} L={L} />
        </h1>
      );
    }
    case "paragraph":
      return <p className="text-base leading-relaxed opacity-70">{L(tk.content(component.id), component.content)}</p>;
    case "image":
      return component.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={component.src} alt="" className="max-h-72 w-full rounded-2xl object-cover" />
      ) : null;
    case "stats":
      return component.stats && component.stats.length > 0 ? <StatsBar stats={component.stats} /> : null;
    case "review":
      return <ReviewView answers={answers} definition={definition} label={L(tk.label(component.id), component.label)} />;
    default: {
      const label = L(tk.label(component.id), component.label);
      const help = L(tk.help(component.id), component.helpText);
      return (
        <div className="space-y-1.5">
          {label && <label className="block text-base font-medium">{label}</label>}
          {help && <p className="text-sm opacity-60">{help}</p>}
          <Field component={component} value={component.key ? answers[component.key] : undefined} onChange={onChange} />
        </div>
      );
    }
  }
}

function ReviewView({
  answers,
  definition,
  label,
}: {
  answers: Answers;
  definition: JourneyDefinition;
  label?: string;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  for (const page of definition.pages) {
    for (const c of page.components) {
      if (!c.key || answers[c.key] === undefined || answers[c.key] === "") continue;
      const raw = answers[c.key];
      const display = c.options
        ? (Array.isArray(raw) ? raw : [raw])
            .map((val) => c.options?.find((o) => o.value === val)?.label ?? String(val))
            .join(", ")
        : Array.isArray(raw)
          ? raw.join(", ")
          : String(raw);
      rows.push({ label: c.label ?? c.key, value: display });
    }
  }
  return (
    <div className="space-y-4">
      {label && <p className="opacity-60">{label}</p>}
      <dl
        className="divide-y rounded-2xl px-5"
        style={{
          background: "color-mix(in srgb, var(--text) 4%, transparent)",
          borderColor: "color-mix(in srgb, var(--text) 10%, transparent)",
        }}
      >
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-6 py-3 text-sm">
            <dt className="opacity-50">{r.label}</dt>
            <dd className="text-right font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatPhone(raw: string): string {
  const d = raw.replace(/[^\d]/g, "").replace(/^1/, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

// Animated count-up for a trust figure like "$50M+", "200+", "4.9", "$1,273,000".
function CountUp({ raw }: { raw: string }) {
  const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/);
  const target = m ? parseFloat(m[2]!.replace(/,/g, "")) : 0;
  const decimals = m ? (m[2]!.split(".")[1]?.length ?? 0) : 0;
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!m) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1800;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <>{raw}</>;
  const shown = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();
  return (
    <>
      {m[1]}
      {shown}
      {m[3]}
    </>
  );
}

// Trust metrics as one elevated, bordered card — icon over a counting number
// over a label, split by subtle dividers (Apple/Stripe-style stat row).
function StatsBar({ stats }: { stats: StatItem[] }) {
  return (
    <div
      className="animate-fade-up rounded-2xl border px-5 py-6 shadow-sm sm:px-8 sm:py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--text) 12%, transparent)",
        // Tint from the page background (not --surface) so the card floats on
        // the hero as a subtle lift regardless of the journey's surface color.
        background: "color-mix(in srgb, var(--text) 6%, var(--bg))",
      }}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className={`px-3 text-center sm:px-5 ${i > 0 ? "border-l" : ""}`}
            style={{ borderColor: "color-mix(in srgb, var(--text) 10%, transparent)" }}
          >
            {s.icon && <div className="mb-2 text-2xl leading-none">{s.icon}</div>}
            <div className="text-[26px] font-bold leading-none sm:text-3xl">
              <CountUp raw={s.value} />
            </div>
            <div className="mt-2.5 text-[11px] leading-tight opacity-60 sm:text-xs">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Optional content shown BELOW the fold on the landing screen: an FAQ accordion
// and/or an auto-advancing reviews carousel. Only rendered when configured; it
// never affects the full-screen above-the-fold layout.
function BelowFold({
  theme,
  L,
  cta,
}: {
  theme: NonNullable<JourneyDefinition["theme"]>;
  L: Localize;
  cta?: React.ReactNode;
}) {
  const faq = theme.faq;
  const reviews = theme.reviews;
  const showFaq = Boolean(faq?.enabled && (faq.items?.length ?? 0) > 0);
  const showReviews = Boolean(reviews?.enabled && (reviews.items?.length ?? 0) > 0);
  if (!showFaq && !showReviews) return null;
  const faqNode = showFaq ? <FaqSection faq={faq!} L={L} /> : null;
  const reviewsNode = showReviews ? <ReviewsCarousel reviews={reviews!} L={L} /> : null;
  const reviewsFirst = theme.belowFold?.reviewsFirst;
  return (
    <div>
      {reviewsFirst ? reviewsNode : faqNode}
      {reviewsFirst ? faqNode : reviewsNode}
      {cta && (
        <section className="border-t border-[color:color-mix(in_srgb,var(--text)_10%,transparent)] px-6 py-14 md:py-16">
          <div className="mx-auto flex w-full max-w-md flex-col gap-3">{cta}</div>
        </section>
      )}
    </div>
  );
}

function PlusToggle({ open }: { open: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
      style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`}
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  );
}

function FaqSection({ faq, L }: { faq: NonNullable<NonNullable<JourneyDefinition["theme"]>["faq"]>; L: Localize }) {
  const items = faq.items ?? [];
  const heading = L(tk.faqHeading(), faq.heading) || "Frequently Asked Questions";
  const disclaimer = L(tk.faqDisclaimer(), faq.disclaimer) || undefined;
  const [open, setOpen] = useState<number | null>(null);
  const divide = "border-t border-[color:color-mix(in_srgb,var(--text)_12%,transparent)]";
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-14 md:py-20">
      <h2 className="text-2xl font-semibold sm:text-3xl">{heading}</h2>
      <div className="mt-6">
        {items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className={`${i === 0 ? "" : divide} py-4`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-5 text-left focus-ring"
              >
                <span className="text-lg font-medium leading-snug sm:text-xl">{L(tk.faqQuestion(i), it.q)}</span>
                <PlusToggle open={isOpen} />
              </button>
              {isOpen && (
                <p className="animate-fade-up mt-3 max-w-[70ch] pr-10 leading-relaxed opacity-75">
                  {L(tk.faqAnswer(i), it.a)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {disclaimer && (
        <p className={`${divide} mt-4 pt-5 text-sm leading-relaxed opacity-55`}>{disclaimer}</p>
      )}
    </section>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden className="shrink-0">
      <path fill="#4285F4" d="M45 24c0-1.5-.1-3-.4-4.4H24v8.4h11.8c-.5 2.8-2 5.1-4.4 6.7v5.6h7.1C42.7 36.4 45 30.7 45 24z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.6c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.1 12.2-9.1z" />
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(rating || 5)));
  return (
    <div className="mt-0.5 text-[15px] tracking-wide text-amber-400" aria-label={`${full} out of 5 stars`}>
      {"★".repeat(full)}
      <span className="text-black/15">{"★".repeat(5 - full)}</span>
    </div>
  );
}

function ReviewCard({ review, index, L }: { review: { name: string; text: string; rating?: number; source?: string }; index: number; L: Localize }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col rounded-2xl bg-white p-6 text-[#0b1f3a] shadow-xl">
      <p className="flex-1 text-[15px] leading-relaxed">{L(tk.reviewText(index), review.text)}</p>
      <div className="mt-4 flex items-center gap-3 border-t border-black/10 pt-4">
        {(review.source ?? "Google").toLowerCase() === "google" && <GoogleG />}
        <div>
          <div className="text-sm font-semibold">{review.name}</div>
          <Stars rating={review.rating ?? 5} />
        </div>
      </div>
    </div>
  );
}

function ReviewsCarousel({
  reviews,
  L,
}: {
  reviews: NonNullable<NonNullable<JourneyDefinition["theme"]>["reviews"]>;
  L: Localize;
}) {
  const items = reviews.items ?? [];
  const n = items.length;
  const heading = L(tk.reviewsHeading(), reviews.heading) || undefined;
  const intervalMs = Math.max(2, reviews.intervalSeconds ?? 10) * 1000;
  const arrow =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110";

  // Single review — no track/arrows needed.
  if (n === 0) return null;
  if (n === 1) {
    return (
      <section className="border-t border-[color:color-mix(in_srgb,var(--text)_10%,transparent)] px-6 py-14 md:py-20">
        {heading && <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">{heading}</h2>}
        <div className="mx-auto max-w-md">
          <ReviewCard review={items[0]!} index={0} L={L} />
        </div>
      </section>
    );
  }

  return <SlidingReviews items={items} heading={heading} intervalMs={intervalMs} arrow={arrow} L={L} />;
}

// A horizontally-sliding, infinitely-looping reviews track. Clones a couple of
// cards on each end so advancing/rewinding across the boundary slides smoothly,
// then silently snaps back into the real range once the transition finishes.
function SlidingReviews({
  items,
  heading,
  intervalMs,
  arrow,
  L,
}: {
  items: { name: string; text: string; rating?: number; source?: string }[];
  heading?: string;
  intervalMs: number;
  arrow: string;
  L: Localize;
}) {
  const n = items.length;
  const clones = 2;
  const tagged = items.map((r, i) => ({ ...r, _i: i }));
  const slides = [...tagged.slice(-clones), ...tagged, ...tagged.slice(0, clones)];
  const start = clones; // index of the first real card in `slides`
  const [index, setIndex] = useState(start);
  const [animate, setAnimate] = useState(true);
  // Cards per view: 1 on phones, 2 on wider screens. The translate step is one
  // card = 100/perView % of the container (the track's own width), so the slide
  // always lands on a whole card.
  const [perView, setPerView] = useState(2);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPerView(mq.matches ? 1 : 2);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // After a slide lands in the cloned region, jump (without animation) to the
  // matching real card so the loop is seamless.
  const onEnd = () => {
    if (index >= n + clones) {
      setAnimate(false);
      setIndex(index - n);
    } else if (index < clones) {
      setAnimate(false);
      setIndex(index + n);
    }
  };
  useEffect(() => {
    if (!animate) {
      const r = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(r);
    }
  }, [animate]);

  return (
    <section className="border-t border-[color:color-mix(in_srgb,var(--text)_10%,transparent)] px-6 py-14 md:py-20">
      {heading && <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">{heading}</h2>}
      <div className="mx-auto flex max-w-5xl items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-label="Previous review"
          onClick={() => setIndex((i) => i - 1)}
          className={arrow}
          style={{ background: "var(--acc)" }}
        >
          <ChevronIcon className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex"
            style={{
              transform: `translateX(-${(index * 100) / perView}%)`,
              transition: animate ? "transform 650ms cubic-bezier(0.22,1,0.36,1)" : "none",
            }}
            onTransitionEnd={onEnd}
          >
            {slides.map((s, i) => (
              <div key={i} className="w-full shrink-0 px-2 md:w-1/2">
                <ReviewCard review={s} index={s._i} L={L} />
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next review"
          onClick={() => setIndex((i) => i + 1)}
          className={arrow}
          style={{ background: "var(--acc)" }}
        >
          <ChevronIcon />
        </button>
      </div>
    </section>
  );
}

// Desktop-only "quick callback" card: a labeled divider, a compact contact
// form (short fields in a row, an optional message + submit button), and a
// secure footer. Config-driven text with sensible defaults; submitting runs the
// page's normal advance (recording the lead).
function CallbackCard({
  fields,
  answers,
  theme,
  L,
  onField,
  onSubmit,
  busy,
  error,
}: {
  fields: Component[];
  answers: Answers;
  definition: JourneyDefinition;
  theme: JourneyDefinition["theme"] & object;
  L: Localize;
  onField: (key: string, value: unknown) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const heading =
    L(tk.callbackHeading(), theme.callback?.heading) || "Prefer a quick callback? Leave your information.";
  const buttonLabel = L(tk.callbackButton(), theme.callback?.buttonLabel) || "Request callback";
  const buttonSub = L(tk.callbackButtonSub(), theme.callback?.buttonSubtitle) || "We'll reach out shortly";
  const secure =
    L(tk.callbackSecure(), theme.callback?.secureText) || "Your information is secure and will never be shared.";
  const shortFields = fields.filter((f) => f.type !== "longText");
  const longField = fields.find((f) => f.type === "longText");
  const rule = "h-px flex-1 bg-[color:color-mix(in_srgb,var(--text)_16%,transparent)]";
  // "Request callback" button styling — accent bg, white text, no border by
  // default; each is overridable in the theme. Once any field has text, the
  // button switches to its "active" colors (falling back to the resting ones)
  // as a cue that the visitor has started.
  const anyFilled = fields.some((f) => {
    if (!f.key) return false;
    const v = answers[f.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "";
  });
  const restBg = theme.callback?.buttonBg || "var(--acc)";
  const restText = theme.callback?.buttonText || "#ffffff";
  const btnBg = anyFilled ? theme.callback?.buttonActiveBg || restBg : restBg;
  const btnText = anyFilled ? theme.callback?.buttonActiveText || restText : restText;
  const btnBorder = anyFilled
    ? (theme.callback?.buttonActiveBorderColor ?? theme.callback?.buttonBorderColor)
    : theme.callback?.buttonBorderColor;
  return (
    <div className="hidden md:block">
      {/* Labeled divider — the "top border" of the callback section. */}
      <div className="flex items-center gap-3 text-sm opacity-75">
        <span className={rule} />
        <span className="flex items-center gap-2 font-medium">
          <MailIcon />
          {heading}
        </span>
        <span className={rule} />
      </div>

      <div
        className="mt-3 grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(shortFields.length, 3)}, minmax(0, 1fr))` }}
      >
        {shortFields.map((f) => (
          <CallbackField
            key={f.id}
            field={f}
            value={f.key ? answers[f.key] : undefined}
            onChange={(v) => f.key && onField(f.key, v)}
            L={L}
          />
        ))}
      </div>

      <div className={`mt-2.5 grid gap-2.5 ${longField ? "md:grid-cols-3" : ""}`}>
        {longField && (
          <div className="md:col-span-2">
            <CallbackField
              field={longField}
              value={longField.key ? answers[longField.key] : undefined}
              onChange={(v) => longField.key && onField(longField.key, v)}
              L={L}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="flex flex-col items-center justify-center rounded-xl px-5 py-3 font-bold leading-tight shadow-md transition hover:brightness-110 active:scale-[0.98] focus-ring disabled:opacity-50"
          style={{
            background: btnBg,
            color: btnText,
            border: btnBorder ? `2px solid ${btnBorder}` : undefined,
          }}
        >
          <span className="text-sm uppercase tracking-wide">{buttonLabel}</span>
          {buttonSub && <span className="mt-0.5 text-[12px] font-medium normal-case opacity-85">{buttonSub}</span>}
        </button>
      </div>

      {/* Validation feedback for the card's own fields, shown right here so it's
          visible next to the button rather than up by the main CTA. */}
      {error && <p className="mt-2 text-sm font-medium text-[color:var(--acc)]">{error}</p>}

      {/* Secure footer — the lock line. */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs opacity-55">
        <LockIcon />
        {secure}
      </div>
    </div>
  );
}

// A single callback-card input with a leading type icon (name / phone / email /
// message). Label doubles as the placeholder for the clean, boxed look.
function CallbackField({
  field,
  value,
  onChange,
  L,
}: {
  field: Component;
  value: unknown;
  onChange: (v: unknown) => void;
  L: Localize;
}) {
  const ph = L(tk.label(field.id), field.label) || field.placeholder || "";
  const v = value == null ? "" : String(value);
  const icon =
    field.type === "phone" ? (
      <PhoneIcon />
    ) : field.type === "email" ? (
      <MailIcon />
    ) : field.type === "longText" ? (
      <ChatIcon />
    ) : (
      <UserIcon />
    );
  if (field.type === "longText") {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-3 opacity-45">{icon}</span>
        <textarea
          className="j-input-onbg w-full rounded-xl py-3 pl-10 pr-3 text-base transition focus-ring"
          rows={2}
          placeholder={ph}
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-45">{icon}</span>
      <input
        type={inputType}
        className="j-input-onbg w-full rounded-xl py-3 pl-10 pr-3 text-base transition focus-ring"
        placeholder={ph}
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden className={className}>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1L6.6 10.8z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// A CTA/primary button. With a subtitle/note/icon it renders in the richer
// icon-left layout (title over subtitle, optional pill on the right); otherwise
// a simple centered button. Works as a link (<a>) or an action (<button>).
function ActionButton({
  as = "button",
  href,
  onClick,
  disabled,
  variant = "primary",
  icon,
  title,
  subtitle,
  note,
}: {
  as?: "a" | "button";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline";
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  note?: string;
}) {
  const base = variant === "outline" ? "j-outline" : "j-cta j-cta-primary";
  const rich = Boolean(subtitle || note || icon);
  const cls = rich
    ? `${base} flex w-full items-center gap-3.5 rounded-[var(--radius)] px-3.5 py-3 text-left focus-ring md:py-2`
    : `${base} inline-flex min-h-[3.5rem] w-full items-center justify-center rounded-[var(--radius)] px-8 text-lg font-semibold focus-ring`;
  const full = `${cls} ${as === "button" ? "disabled:opacity-50" : ""}`;
  // High-contrast accents. On the filled (Call) button the icon circle and pill
  // use the site background with white content. On the outlined (Start) button
  // the icon circle uses the filled button's color so it pops.
  const circleStyle: React.CSSProperties =
    variant === "outline"
      ? { background: "var(--cta-bg)", color: "var(--cta-text)" }
      : { background: "var(--bg)", color: "#ffffff" };
  const pillStyle: React.CSSProperties =
    variant === "outline"
      ? { background: "var(--cta-bg)", color: "var(--cta-text)" }
      : { background: "var(--bg)", color: "#ffffff" };
  const body = rich ? (
    <>
      {icon && (
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm"
          style={circleStyle}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-tight">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] font-medium leading-snug opacity-75">{subtitle}</span>
        )}
      </span>
      {note ? (
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={pillStyle}
        >
          {note}
        </span>
      ) : (
        <ChevronIcon className="shrink-0 opacity-45" />
      )}
    </>
  ) : (
    title
  );
  return as === "a" ? (
    <a href={href} onClick={onClick} className={full}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={full}>
      {body}
    </button>
  );
}

function isCallCta(c: { type?: string; href?: string }) {
  return c.type === "call" || c.type === "text" || c.href?.startsWith("tel:");
}
// Call-to-action buttons. Call buttons show on every size (tappable to dial);
// the phone number is appended inside the button on desktop only, so the mobile
// button stays compact. Non-call CTAs (links) show on all sizes.
function CtaBlock({
  page,
  L,
  onCtaClick,
  onPhoneClick,
}: {
  page: Page;
  L: Localize;
  onCtaClick?: () => void;
  onPhoneClick?: () => void;
}) {
  if (!page.cta || page.cta.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      <CtaButtons page={page} L={L} onCtaClick={onCtaClick} onPhoneClick={onPhoneClick} />
    </div>
  );
}

// The CTA buttons themselves — reused on ending screens and inline with the
// Continue button on form screens.
function CtaButtons({
  page,
  L,
  onCtaClick,
  onPhoneClick,
}: {
  page: Page;
  L: Localize;
  onCtaClick?: () => void;
  onPhoneClick?: () => void;
}) {
  if (!page.cta || page.cta.length === 0) return null;
  return (
    <>
      {page.cta.map((cta, i) => {
        const label = L(tk.cta(page.id, i), cta.label);
        const subtitle = L(tk.ctaSubtitle(page.id, i), cta.subtitle) || undefined;
        const note = L(tk.ctaNote(page.id, i), cta.note) || undefined;
        const call = isCallCta(cta);
        // On desktop, a call button also shows the phone number inline (people
        // can read/dial it directly). Hidden on mobile, where tapping calls.
        const phone = call ? formatPhone((cta.value ?? "").trim()) : "";
        const title =
          call && phone ? (
            <>
              {label}
              <span className="ml-2 hidden font-semibold opacity-90 md:inline">{phone}</span>
            </>
          ) : (
            label
          );
        return (
          <ActionButton
            key={i}
            as="a"
            href={ctaHref(cta)}
            onClick={call ? (onPhoneClick ?? onCtaClick) : onCtaClick}
            variant={cta.style === "secondary" ? "outline" : "primary"}
            icon={call ? <PhoneIcon /> : undefined}
            title={title}
            subtitle={subtitle}
            note={note}
          />
        );
      })}
    </>
  );
}

// Full-width top banner that slides down on load. Editable announcements +
// an optional click-to-call button (desktop).
// Whether the journey logo should sit inside the top bar (opt-in via
// banner.logoInBar). When off, the logo stays in the in-form header.
function bannerLogoShown(theme: NonNullable<JourneyDefinition["theme"]>): boolean {
  // Logo lives in the top bar by default whenever one is set; opt out with
  // banner.logoInBar === false.
  return Boolean(theme.logoUrl) && theme.banner?.logoInBar !== false;
}

// A component can be limited to one device via props.showOn ("mobile"|"desktop").
function deviceMatches(c: Component, isMobile: boolean): boolean {
  const showOn = c.props?.showOn;
  if (showOn === "mobile") return isMobile;
  if (showOn === "desktop") return !isMobile;
  return true;
}
// Tailwind visibility for a device-scoped component (CSS-driven, no hydration flash).
function deviceClass(c: Component): string {
  const showOn = c.props?.showOn;
  if (showOn === "mobile") return "md:hidden";
  if (showOn === "desktop") return "hidden md:block";
  return "";
}

// Whether the top banner bar should render (enabled + has content or a bar logo).
function bannerShown(theme: NonNullable<JourneyDefinition["theme"]>): boolean {
  const b = theme.banner;
  if (!b || b.enabled === false) return false;
  return (b.items?.length ?? 0) > 0 || Boolean(b.phone) || bannerLogoShown(theme);
}

function Banner({
  theme,
  L,
  onCtaClick,
  languages,
  locale,
  setLocale,
  logoMobileHidden,
}: {
  theme: NonNullable<JourneyDefinition["theme"]>;
  L: Localize;
  onCtaClick?: () => void;
  languages: string[];
  locale: string;
  setLocale: (l: string) => void;
  logoMobileHidden?: boolean;
}) {
  if (!bannerShown(theme)) return null;
  const banner = theme.banner!;
  const items = banner.items ?? [];
  return (
    <div
      className="animate-slide-down w-full border-b"
      style={{
        background: banner.background ?? "color-mix(in srgb, var(--text) 8%, var(--bg))",
        color: banner.textColor,
        borderColor: "color-mix(in srgb, var(--text) 12%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-2 overflow-hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wide sm:gap-x-4 sm:px-4 sm:py-1.5 sm:text-sm">
        <div className="flex min-w-0 flex-nowrap items-center gap-x-2 whitespace-nowrap sm:gap-x-3">
          {items.map((it, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2 sm:gap-3">
              {i > 0 && <span className="opacity-30">|</span>}
              <span className={i === 0 && !banner.textColor ? "text-[color:var(--acc)]" : ""}>
                {L(tk.bannerItem(i), it)}
              </span>
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {banner.phone && (
            <a
              href={`tel:${banner.phone.replace(/[^\d+]/g, "")}`}
              onClick={onCtaClick}
              className="j-cta hidden items-center gap-2 rounded-full px-4 py-1.5 normal-case sm:inline-flex"
            >
              <PhoneIcon />
              {banner.phoneLabel ?? "Call Now"} {formatPhone(banner.phone)}
            </a>
          )}
          {bannerLogoShown(theme) && (
            <span className={logoMobileHidden ? "hidden md:block" : ""}>
              <LogoOrName logoUrl={theme.logoUrl} logoLink={theme.logoLink} firm="" inBar />
            </span>
          )}
          <LangToggle languages={languages} locale={locale} setLocale={setLocale} className="shrink-0" compact />
        </div>
      </div>
    </div>
  );
}

// Built-in confirmation shown only when a lead submits successfully but the
// journey defines no ending page. A safety net so a completed visitor is never
// dropped back on the start form.
function FallbackEnding({ locale }: { locale: string }) {
  const es = locale?.toLowerCase().startsWith("es");
  const title = es ? "Gracias — hemos recibido tu información." : "Thank you — we've got your information.";
  const body = es
    ? "Un miembro de nuestro equipo se pondrá en contacto contigo en breve."
    : "A team member will reach out shortly.";
  return (
    <div className="animate-fade-up space-y-6">
      <h1 className="whitespace-pre-line text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="text-lg leading-relaxed opacity-70">{body}</p>
    </div>
  );
}

function EndingView({
  page,
  L,
  onCtaClick,
  onPhoneClick,
}: {
  page: Page;
  L: Localize;
  onCtaClick?: () => void;
  onPhoneClick?: () => void;
}) {
  return (
    <div className="animate-fade-up space-y-6">
      {page.components.map((c) =>
        c.type === "heading" ? (
          <h1 key={c.id} className="whitespace-pre-line text-3xl font-semibold sm:text-4xl">
            {L(tk.content(c.id), c.content)}
          </h1>
        ) : c.type === "stats" && c.stats ? (
          <StatsBar key={c.id} stats={c.stats} />
        ) : (
          <p key={c.id} className="text-lg leading-relaxed opacity-70">
            {L(tk.content(c.id), c.content)}
          </p>
        ),
      )}
      <CtaBlock page={page} L={L} onCtaClick={onCtaClick} onPhoneClick={onPhoneClick} />
    </div>
  );
}
