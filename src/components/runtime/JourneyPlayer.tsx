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

import { useCallback, useMemo, useRef, useState } from "react";
import type { Component, JourneyDefinition, Option, Page } from "@/modules/journeys/domain/schema";
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
          body: JSON.stringify({ slug, answers: ans, attribution, endingType }),
        });
        const data = (await res.json()) as { ok: boolean; outcome?: Outcome; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong.");
        return data.outcome ?? "lead";
      } catch (e) {
        submittedRef.current = false;
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [slug, attribution],
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
    const next = { ...answers, [component.key!]: opt.value };
    setAnswers(next);
    void advance(page!, next, opt.goTo);
  }

  function set(key: string, value: unknown) {
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

  const styleVars = useMemo(
    () =>
      ({
        ["--acc"]: theme.colorAccent ?? "#e63946",
        ["--bg"]: theme.colorBackground ?? "#ffffff",
        ["--surface"]: theme.colorSurface ?? theme.colorBackground ?? "#ffffff",
        ["--text"]: theme.colorText ?? "#0b1f3a",
        ["--radius"]: theme.radius ?? "9999px",
      }) as React.CSSProperties,
    [theme],
  );

  const firm = attribution?.firm ?? "";

  return (
    <main
      style={{
        ...styleVars,
        background: theme.colorBackground ?? "#ffffff",
        color: theme.colorText ?? "#0b1f3a",
        fontFamily: theme.fontFamily,
      }}
      className="flex min-h-dvh flex-col md:flex-row"
    >
      {theme.sideImageUrl && (
        <aside
          className="hidden bg-cover bg-center md:block md:w-[38%] lg:w-[40%]"
          style={{ backgroundImage: `url("${theme.sideImageUrl}")` }}
          aria-hidden
        />
      )}

      <section className="relative flex flex-1 flex-col px-6 py-8 md:px-14">
        <header className="flex h-12 items-center justify-between">
          {languages.length > 1 ? (
            <div className="flex items-center gap-1 text-sm">
              {languages.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLocale(lng)}
                  aria-pressed={locale === lng}
                  className={`rounded-full px-3 py-1 transition ${
                    locale === lng ? "bg-[color:var(--text)] text-[color:var(--bg)]" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {(LANGUAGE_LABELS[lng] ?? lng).slice(0, 3)}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="" className="max-h-11 w-auto object-contain" />
          ) : firm ? (
            <span className="text-lg font-semibold">{firm}</span>
          ) : null}
        </header>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-8">
          {terminal ? (
            <EndingView page={page!} L={L} />
          ) : (
            <div key={page?.id} className="animate-fade-up space-y-8">
              <div className="space-y-6">
                {page?.components
                  .filter((c) => isComponentVisible(c, definition, answers))
                  .map((c) =>
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

              <div className="flex items-center gap-4 pt-2">
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
                    className="rounded-[var(--radius)] bg-[color:var(--acc)] px-8 py-3 font-medium text-white shadow-sm transition hover:opacity-90 focus-ring disabled:opacity-50"
                  >
                    {busy
                      ? locale === "es"
                        ? "Enviando…"
                        : "Submitting…"
                      : page?.type === "review"
                        ? locale === "es"
                          ? "Enviar"
                          : "Submit"
                        : locale === "es"
                          ? "Continuar"
                          : "Continue"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
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
            className="j-option rounded-[var(--radius)] px-5 py-4 text-center font-medium shadow-sm focus-ring disabled:opacity-50"
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
      return <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{L(tk.content(component.id), component.content)}</h1>;
    case "paragraph":
      return <p className="text-lg leading-relaxed opacity-70">{L(tk.content(component.id), component.content)}</p>;
    case "image":
      return component.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={component.src} alt="" className="max-h-72 w-full rounded-2xl object-cover" />
      ) : null;
    case "review":
      return <ReviewView answers={answers} definition={definition} label={L(tk.label(component.id), component.label)} />;
    default: {
      const label = L(tk.label(component.id), component.label);
      const help = L(tk.help(component.id), component.helpText);
      return (
        <div className="space-y-3">
          {label && <label className="block text-xl font-medium">{label}</label>}
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

function EndingView({ page, L }: { page: Page; L: Localize }) {
  return (
    <div className="animate-fade-up space-y-6">
      {page.components.map((c) =>
        c.type === "heading" ? (
          <h1 key={c.id} className="text-3xl font-semibold sm:text-4xl">
            {L(tk.content(c.id), c.content)}
          </h1>
        ) : (
          <p key={c.id} className="text-lg leading-relaxed opacity-70">
            {L(tk.content(c.id), c.content)}
          </p>
        ),
      )}
      {page.cta && page.cta.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2">
          {page.cta.map((cta, i) =>
            cta.style === "secondary" ? (
              <a key={i} href={ctaHref(cta)} className="j-outline rounded-[var(--radius)] px-6 py-3 font-medium focus-ring">
                {L(tk.cta(page.id, i), cta.label)}
              </a>
            ) : (
              <a
                key={i}
                href={ctaHref(cta)}
                className="rounded-[var(--radius)] bg-[color:var(--acc)] px-6 py-3 font-medium text-white shadow-sm transition hover:opacity-90 focus-ring"
              >
                {L(tk.cta(page.id, i), cta.label)}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}
