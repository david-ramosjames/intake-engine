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
      if (c.key && c.validation?.required && isComponentVisible(c, definition, answers)) {
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
    } as React.CSSProperties;
  }, [theme]);

  const firm = attribution?.firm ?? "";

  // Trust stats render at the bottom (under the CTAs); everything else on top.
  const visibleComps = (page?.components ?? []).filter((c) => isComponentVisible(c, definition, answers));
  const statsComps = visibleComps.filter((c) => c.type === "stats");
  const mainComps = visibleComps.filter((c) => c.type !== "stats");
  const continueText = busy
    ? locale === "es"
      ? "Enviando…"
      : "Submitting…"
    : page?.type === "review"
      ? locale === "es"
        ? "Enviar"
        : "Submit"
      : L(tk.continue(page?.id ?? ""), page?.continueLabel) || (locale === "es" ? "Continuar" : "Continue");

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
      <Banner theme={theme} L={L} onCtaClick={() => emit("cta_click")} />
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

      <section className="relative flex flex-1 flex-col px-6 py-6 md:px-14">
        <header className="flex h-14 items-center justify-between">
          {languages.length > 1 ? (
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {languages.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLocale(lng)}
                  aria-pressed={locale === lng}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 transition ${
                    locale === lng
                      ? "border-transparent bg-[color:var(--text)] text-[color:var(--bg)]"
                      : "border-[color:color-mix(in_srgb,var(--text)_25%,transparent)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <Flag code={lng} />
                  {(LANGUAGE_LABELS[lng] ?? lng).slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <LogoOrName logoUrl={theme.logoUrl} logoLink={theme.logoLink} firm={firm} />
        </header>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4">
          {terminal ? (
            <EndingView page={page!} L={L} onCtaClick={() => emit("cta_click")} />
          ) : (
            <div key={page?.id} className="animate-fade-up space-y-6">
              <div className="space-y-5">
                {mainComps.map((c) =>
                  soleChoice && c.id === soleChoice.id ? (
                    <ChoiceGrid key={c.id} component={c} L={L} onSelect={(o) => selectOption(c, o)} disabled={busy} />
                  ) : (
                    <ContentOrField
                      key={c.id}
                      component={c}
                      answers={answers}
                      definition={definition}
                      L={L}
                      onChange={(v) => c.key && set(c.key, v)}
                    />
                  ),
                )}
              </div>

              {error && <p className="text-sm text-[color:var(--acc)]">{error}</p>}

              {/* Primary intake action first, so it's never lost. */}
              <div className="flex items-center gap-4">
                {history.length > 1 && (
                  <button
                    type="button"
                    onClick={back}
                    className="rounded-[var(--radius)] px-5 py-3 opacity-70 transition hover:opacity-100 focus-ring"
                  >
                    ← {locale === "es" ? "Atrás" : "Back"}
                  </button>
                )}
                {!soleChoice && (
                  <button
                    type="button"
                    onClick={onContinue}
                    disabled={busy}
                    className="rounded-[var(--radius)] bg-[color:var(--acc)] px-10 py-4 text-lg font-semibold text-white shadow-md transition hover:opacity-90 focus-ring disabled:opacity-50"
                  >
                    {continueText}
                  </button>
                )}
              </div>

              {/* Call CTA below the intake button. */}
              {page?.cta && page.cta.length > 0 && (
                <CtaBlock page={page} L={L} onCtaClick={() => emit("cta_click")} />
              )}

              {/* Trust stats under the CTAs. */}
              {statsComps.map((c) => (c.stats ? <StatsBar key={c.id} stats={c.stats} /> : null))}
            </div>
          )}
        </div>
      </section>
      </div>
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

function LogoOrName({ logoUrl, logoLink, firm }: { logoUrl?: string; logoLink?: string; firm: string }) {
  const inner = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={firm || "logo"} className="max-h-20 w-auto object-contain md:max-h-28" />
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
    case "heading":
      return <h1 className="whitespace-pre-line text-3xl font-semibold leading-tight sm:text-4xl">{L(tk.content(component.id), component.content)}</h1>;
    case "paragraph":
      return <p className="text-lg leading-relaxed opacity-70">{L(tk.content(component.id), component.content)}</p>;
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
        <div className="space-y-2">
          {label && <label className="block text-lg font-medium">{label}</label>}
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

function StatsBar({ stats }: { stats: StatItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-5">
      {stats.map((s, i) => (
        <div
          key={i}
          className={i > 0 ? "sm:border-l sm:pl-8" : ""}
          style={i > 0 ? { borderColor: "color-mix(in srgb, currentColor 18%, transparent)" } : undefined}
        >
          <div className="flex items-baseline gap-2">
            {s.icon && <span className="text-2xl leading-none">{s.icon}</span>}
            <span className="text-2xl font-semibold sm:text-3xl">
              <CountUp raw={s.value} />
            </span>
          </div>
          <div className="mt-1 text-sm opacity-70">{s.label}</div>
        </div>
      ))}
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

function isCallCta(c: { type?: string; href?: string }) {
  return c.type === "call" || c.type === "text" || c.href?.startsWith("tel:");
}
function ctaNumber(c: { value?: string; href?: string }) {
  return c.value ?? c.href?.replace(/^tel:|^sms:/, "") ?? "";
}

// Call-to-action buttons. Call buttons show the number inside the button on
// desktop and are hidden on mobile (the big tappable number covers mobile).
// Non-call CTAs (links) show on all sizes.
function CtaBlock({ page, L, onCtaClick }: { page: Page; L: Localize; onCtaClick?: () => void }) {
  if (!page.cta || page.cta.length === 0) return null;
  const phoneCta = page.cta.find(isCallCta);
  const phoneValue = phoneCta ? ctaNumber(phoneCta) : "";
  return (
    <div className="space-y-4 pt-1">
      {/* Mobile: big tap-to-call number (desktop uses the button instead). */}
      {phoneValue && (
        <a
          href={`tel:${phoneValue.replace(/[^\d+]/g, "")}`}
          onClick={onCtaClick}
          className="inline-block text-3xl font-bold tracking-tight text-[color:var(--acc)] underline-offset-4 hover:underline sm:hidden"
        >
          {formatPhone(phoneValue)}
        </a>
      )}
      <div className="flex flex-wrap gap-3">
        {page.cta.map((cta, i) => {
          const label = L(tk.cta(page.id, i), cta.label);
          if (isCallCta(cta)) {
            const num = ctaNumber(cta);
            return (
              <a
                key={i}
                href={ctaHref(cta)}
                onClick={onCtaClick}
                className="hidden items-center gap-2 rounded-[var(--radius)] bg-[color:var(--acc)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90 focus-ring sm:inline-flex"
              >
                <PhoneIcon />
                {label}
                {num ? ` ${formatPhone(num)}` : ""}
              </a>
            );
          }
          return cta.style === "secondary" ? (
            <a
              key={i}
              href={ctaHref(cta)}
              onClick={onCtaClick}
              className="j-outline rounded-[var(--radius)] px-6 py-3 font-medium focus-ring"
            >
              {label}
            </a>
          ) : (
            <a
              key={i}
              href={ctaHref(cta)}
              onClick={onCtaClick}
              className="rounded-[var(--radius)] bg-[color:var(--acc)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90 focus-ring"
            >
              {label}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// Full-width top banner that slides down on load. Editable announcements +
// an optional click-to-call button (desktop).
function Banner({
  theme,
  L,
  onCtaClick,
}: {
  theme: NonNullable<JourneyDefinition["theme"]>;
  L: Localize;
  onCtaClick?: () => void;
}) {
  const banner = theme.banner;
  if (!banner || banner.enabled === false) return null;
  const items = banner.items ?? [];
  if (items.length === 0 && !banner.phone) return null;
  return (
    <div
      className="animate-slide-down w-full border-b"
      style={{
        background: "color-mix(in srgb, var(--text) 8%, var(--bg))",
        borderColor: "color-mix(in srgb, var(--text) 12%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-xs font-semibold uppercase tracking-wide sm:justify-between sm:text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {items.map((it, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="opacity-30">|</span>}
              <span className={i === 0 ? "text-[color:var(--acc)]" : ""}>{L(tk.bannerItem(i), it)}</span>
            </span>
          ))}
        </div>
        {banner.phone && (
          <a
            href={`tel:${banner.phone.replace(/[^\d+]/g, "")}`}
            onClick={onCtaClick}
            className="hidden items-center gap-2 rounded-full bg-[color:var(--acc)] px-4 py-1.5 normal-case text-white sm:inline-flex"
          >
            <PhoneIcon />
            {banner.phoneLabel ?? "Call Now"} {formatPhone(banner.phone)}
          </a>
        )}
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
