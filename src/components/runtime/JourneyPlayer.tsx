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
// A headline can be authored as multiple lines, each its own color (props.lines).
type HeadingLine = { text: string; color?: string };
function headingLines(c: Component): HeadingLine[] | null {
  const raw = c.props?.lines;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((l) => {
    const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    return { text: typeof o.text === "string" ? o.text : "", color: typeof o.color === "string" ? o.color : undefined };
  });
}
// Render a heading's inner text — colored lines if authored, else plain content.
function HeadingBody({ component, L }: { component: Component; L: Localize }) {
  const lines = headingLines(component);
  if (!lines) return <>{L(tk.content(component.id), component.content)}</>;
  return (
    <>
      {lines.map((ln, i) => (
        <span key={i} className="block" style={ln.color ? { color: ln.color } : undefined}>
          {L(tk.line(component.id, i), ln.text)}
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
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
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
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  const sessionRef = useRef<string>("");
  const startedRef = useRef(false);

  // Fire-and-forget funnel event.
  const emit = useCallback(
    (type: "opened" | "started" | "completed" | "cta_click", extra?: Record<string, string>) => {
      if (typeof window === "undefined" || !sessionRef.current) return;
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
    [slug, attribution],
  );

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
  const terminal = page ? isTerminalType(page.type) : false;

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

  const advance = useCallback(
    async (from: Page, ans: Answers, optionGoTo?: string) => {
      const target = resolveNext(definition, from.id, ans, optionGoTo);
      if (target == null) {
        const outcome = await submit(ans);
        if (!outcome) return;
        const wantType = outcome === "referral" ? "referral" : outcome === "declined" ? "decline" : "success";
        const end =
          pages.find((p) => p.type === wantType) ??
          pages.find((p) => p.type === "end") ??
          pages.find((p) => isTerminalType(p.type));
        if (end) setHistory((h) => [...h, end.id]);
        return;
      }
      goTo(target, ans);
    },
    [definition, pages, submit, goTo],
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
  }

  function onContinue() {
    if (!page) return;
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
      // Secondary (outlined "start") button — border + text color.
      ["--cta2"]: theme.ctaSecondaryColor ?? theme.colorAccent ?? text,
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

  // Sticky bottom CTA appears once the primary button scrolls out of view.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

  return (
    <main
      style={{
        ...styleVars,
        background: theme.colorBackground ?? "#ffffff",
        color: theme.colorText ?? "#0b1f3a",
        fontFamily: theme.fontFamily,
      }}
      className="flex min-h-dvh flex-col"
    >
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
        <aside
          className="relative hidden bg-cover bg-center md:block md:w-[38%] lg:w-[40%]"
          style={{ backgroundImage: `url("${theme.sideImageUrl}")` }}
        >
          {theme.sideOverlay &&
            (theme.sideOverlay.title || theme.sideOverlay.subtitle || theme.sideOverlay.bullets?.length) && (
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent p-8 text-white lg:p-10">
                {theme.sideOverlay.title && (
                  <div className="text-2xl font-semibold lg:text-3xl">{theme.sideOverlay.title}</div>
                )}
                {theme.sideOverlay.subtitle && (
                  <div className="mt-1 text-white/80">{theme.sideOverlay.subtitle}</div>
                )}
                {theme.sideOverlay.bullets && theme.sideOverlay.bullets.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {theme.sideOverlay.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-white/90">
                        <span className="mt-0.5 text-amber-400" aria-hidden>
                          ★
                        </span>
                        {b}
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
        <div className="relative h-[46vh] w-full shrink-0 overflow-hidden md:hidden">
          <div
            className="absolute inset-0 animate-hero-zoom bg-cover bg-center"
            style={{ backgroundImage: `url("${theme.sideImageUrl}")` }}
          />
          {/* Dark scrim so the white name (top) and headline (bottom) stay
              readable over any photo, regardless of the journey's theme. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/45" />
          {/* Extra darkening in the top-right quarter. */}
          <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-gradient-to-bl from-black/55 via-black/20 to-transparent" />
          {theme.logoUrl && (
            <div className="absolute left-5 top-4">
              <LogoOrName logoUrl={theme.logoUrl} logoLink={theme.logoLink} firm="" inBar />
            </div>
          )}
          {/* Attorney name/details — upper-left, no more than ~1/3 wide. */}
          {(theme.sideOverlay?.title || theme.sideOverlay?.subtitle) && (
            <div className="absolute left-6 top-[15%] max-w-[38%] text-white drop-shadow">
              {theme.sideOverlay?.title && (
                <div className="text-2xl font-bold leading-tight">{theme.sideOverlay.title}</div>
              )}
              {theme.sideOverlay?.subtitle && (
                <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80">
                  {theme.sideOverlay.subtitle}
                </div>
              )}
            </div>
          )}
          {/* Welcome headline — bottom of the photo. */}
          {heroHeading && (
            <h1 className="absolute inset-x-0 bottom-5 whitespace-pre-line px-6 text-3xl font-bold leading-tight text-white drop-shadow">
              <HeadingBody component={heroHeading} L={L} />
            </h1>
          )}
        </div>
      )}

      <section
        className={`relative flex flex-1 flex-col px-6 py-6 md:px-14 ${
          mobileHero ? "z-10 animate-card-rise md:animate-none" : ""
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
          className={`mx-auto flex w-full max-w-2xl flex-1 flex-col py-4 md:justify-center ${
            mobileHero ? "justify-start pt-1" : "justify-center"
          }`}
        >
          {terminal ? (
            <EndingView page={page!} L={L} onCtaClick={() => emit("cta_click")} />
          ) : (
            <div key={page?.id} className="animate-fade-up space-y-5">
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
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

              {/* Content marked to render below the actions (e.g. a desktop-only
                  "or leave your info" form). */}
              {belowComps.map((c) => (
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

      {/* Sticky bottom CTA on phones — the primary action stays a thumb-tap away
          once it scrolls out of view. */}
      {!terminal && !soleChoice && scrolled && (
        <div
          className="animate-bar-up fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 pt-3 backdrop-blur md:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="j-cta j-cta-primary min-h-[3.5rem] w-full rounded-[var(--radius)] text-lg font-semibold focus-ring disabled:opacity-50"
          >
            {continueText}
          </button>
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
  const pad = compact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-2 px-3.5 py-1.5 text-sm";
  return (
    <div className={`flex items-center gap-1 font-medium normal-case ${compact ? "opacity-80" : ""} ${className ?? ""}`}>
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
          {(LANGUAGE_LABELS[lng] ?? lng).slice(0, 2).toUpperCase()}
        </button>
      ))}
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
      className="animate-fade-up rounded-2xl border p-4 shadow-sm"
      style={{
        borderColor: "color-mix(in srgb, var(--text) 12%, transparent)",
        background: "color-mix(in srgb, var(--text) 4%, var(--surface))",
      }}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className={`px-2 text-center ${i > 0 ? "border-l" : ""}`}
            style={{ borderColor: "color-mix(in srgb, var(--text) 12%, transparent)" }}
          >
            {s.icon && <div className="mb-1 text-xl leading-none">{s.icon}</div>}
            <div className="text-2xl font-bold leading-none">
              <CountUp raw={s.value} />
            </div>
            <div className="mt-1.5 text-[11px] leading-tight opacity-60 sm:text-xs">{s.label}</div>
          </div>
        ))}
      </div>
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
    ? `${base} flex w-full items-center gap-3.5 rounded-[var(--radius)] px-3.5 py-3 text-left focus-ring`
    : `${base} inline-flex min-h-[3.5rem] w-full items-center justify-center rounded-[var(--radius)] px-8 text-lg font-semibold focus-ring`;
  const full = `${cls} ${as === "button" ? "disabled:opacity-50" : ""}`;
  const body = rich ? (
    <>
      {icon && (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,currentColor_15%,transparent)] ring-1 ring-[color:color-mix(in_srgb,currentColor_12%,transparent)]">
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
        <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,currentColor_18%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
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
function CtaBlock({ page, L, onCtaClick }: { page: Page; L: Localize; onCtaClick?: () => void }) {
  if (!page.cta || page.cta.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      <CtaButtons page={page} L={L} onCtaClick={onCtaClick} />
    </div>
  );
}

// The CTA buttons themselves — reused on ending screens and inline with the
// Continue button on form screens.
function CtaButtons({ page, L, onCtaClick }: { page: Page; L: Localize; onCtaClick?: () => void }) {
  if (!page.cta || page.cta.length === 0) return null;
  return (
    <>
      {page.cta.map((cta, i) => {
        const label = L(tk.cta(page.id, i), cta.label);
        const subtitle = L(tk.ctaSubtitle(page.id, i), cta.subtitle) || undefined;
        const note = L(tk.ctaNote(page.id, i), cta.note) || undefined;
        const call = isCallCta(cta);
        return (
          <ActionButton
            key={i}
            as="a"
            href={ctaHref(cta)}
            onClick={onCtaClick}
            variant={cta.style === "secondary" ? "outline" : "primary"}
            icon={call ? <PhoneIcon /> : undefined}
            title={label}
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-2 overflow-hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wide sm:gap-x-4 sm:px-4 sm:text-sm">
        <div className="flex min-w-0 flex-nowrap items-center gap-x-2 whitespace-nowrap sm:gap-x-3">
          <LangToggle languages={languages} locale={locale} setLocale={setLocale} className="mr-0.5 shrink-0" compact />
          {items.map((it, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2 sm:gap-3">
              {i > 0 && <span className="opacity-30">|</span>}
              <span className={i === 0 && !banner.textColor ? "text-[color:var(--acc)]" : ""}>
                {L(tk.bannerItem(i), it)}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-4">
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
        </div>
      </div>
    </div>
  );
}

function EndingView({ page, L, onCtaClick }: { page: Page; L: Localize; onCtaClick?: () => void }) {
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
      <CtaBlock page={page} L={L} onCtaClick={onCtaClick} />
    </div>
  );
}
