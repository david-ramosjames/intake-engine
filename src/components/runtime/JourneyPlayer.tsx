"use client";

// The conversational Journey Player. Renders any JourneyDefinition one page at
// a time (Typeform/Landbot feel), evaluates conditional visibility live via the
// runtime engine, validates required fields, and submits to the server for
// authoritative scoring & qualification. Terminal pages (success/decline) are
// shown based on the server outcome, never guessed on the client.

import { useMemo, useState } from "react";
import type { Component, JourneyDefinition, Page } from "@/modules/journeys/domain/schema";
import { isComponentVisible, type Answers } from "@/modules/journeys/runtime/engine";
import { Field } from "./fields";

interface Props {
  slug: string;
  definition: JourneyDefinition;
  attribution?: Record<string, string>;
}

type Outcome = "qualified" | "declined";

function heading(text?: string) {
  return <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{text}</h1>;
}

function requiredMissing(components: Component[], answers: Answers, def: JourneyDefinition): string | null {
  for (const c of components) {
    if (!c.key || !isComponentVisible(c, def, answers)) continue;
    if (c.validation?.required) {
      const val = answers[c.key];
      const empty = val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
      if (empty) return c.label ?? c.key;
    }
  }
  return null;
}

export function JourneyPlayer({ slug, definition, attribution }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const theme = definition.theme ?? {};

  // Flow = visible, non-terminal pages, recomputed as answers change so
  // conditional pages appear/disappear correctly.
  const flow: Page[] = useMemo(() => {
    return definition.pages.filter(
      (p) => p.type !== "success" && p.type !== "decline" && (!p.condition || evalVisible(p, definition, answers)),
    );
  }, [definition, answers]);

  const terminal = useMemo(() => {
    if (!outcome) return null;
    const type = outcome === "qualified" ? "success" : "decline";
    return definition.pages.find((p) => p.type === type) ?? null;
  }, [outcome, definition]);

  const page = flow[Math.min(stepIndex, flow.length - 1)];
  const progress = flow.length > 1 ? Math.round((stepIndex / (flow.length - 1)) * 100) : 0;
  const isReview = page?.type === "review";

  function set(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, answers, attribution }),
      });
      const data = (await res.json()) as { ok: boolean; outcome?: Outcome; error?: string };
      if (!res.ok || !data.ok || !data.outcome) throw new Error(data.error ?? "Something went wrong.");
      setOutcome(data.outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function advance() {
    if (!page) return;
    const missing = requiredMissing(page.components, answers, definition);
    if (missing) {
      setError(`Please answer: ${missing}`);
      return;
    }
    if (isReview || stepIndex >= flow.length - 1) {
      void submit();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  const style = {
    ["--j-bg" as string]: theme.colorBackground ?? "#0b1f3a",
    ["--j-surface" as string]: theme.colorSurface ?? "#12294b",
    ["--j-accent" as string]: theme.colorAccent ?? "#e63946",
  } as React.CSSProperties;

  return (
    <main
      style={{ ...style, background: "var(--j-bg)", color: theme.colorText ?? "#fff" }}
      className="flex min-h-dvh flex-col"
    >
      {/* progress */}
      <div className="h-1 w-full bg-white/10">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${terminal ? 100 : progress}%`, background: "var(--j-accent)" }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        {terminal ? (
          <TerminalView page={terminal} accent={outcome === "qualified"} />
        ) : page ? (
          <div key={page.id} className="animate-fade-up space-y-8">
            <div className="space-y-6">
              {page.components
                .filter((c) => isComponentVisible(c, definition, answers))
                .map((c) => (
                  <ComponentView
                    key={c.id}
                    component={c}
                    value={c.key ? answers[c.key] : undefined}
                    onChange={(val) => c.key && set(c.key, val)}
                    answers={answers}
                    definition={definition}
                  />
                ))}
            </div>

            {error && <p className="text-sm text-[var(--j-accent)]">{error}</p>}

            <div className="flex items-center gap-4 pt-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="rounded-full px-5 py-3 text-white/70 transition hover:text-white focus-ring"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={advance}
                disabled={submitting}
                className="rounded-full bg-white px-8 py-3 font-medium text-[var(--j-bg)] transition hover:opacity-90 focus-ring disabled:opacity-50"
              >
                {submitting ? "Submitting…" : isReview ? "Submit" : "Continue"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ComponentView({
  component,
  value,
  onChange,
  answers,
  definition,
}: {
  component: Component;
  value: unknown;
  onChange: (v: unknown) => void;
  answers: Answers;
  definition: JourneyDefinition;
}) {
  switch (component.type) {
    case "heading":
      return heading(component.content);
    case "paragraph":
      return <p className="text-lg leading-relaxed text-white/70">{component.content}</p>;
    case "review":
      return <ReviewView answers={answers} definition={definition} label={component.label} />;
    default:
      return (
        <div className="space-y-3">
          {component.label && <label className="block text-xl font-medium">{component.label}</label>}
          {component.helpText && <p className="text-sm text-white/50">{component.helpText}</p>}
          <Field component={component} value={value} onChange={onChange} />
        </div>
      );
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
      {label && <p className="text-white/60">{label}</p>}
      <dl className="divide-y divide-white/10 rounded-2xl bg-white/5 px-5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-6 py-3 text-sm">
            <dt className="text-white/50">{r.label}</dt>
            <dd className="text-right font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TerminalView({ page, accent }: { page: Page; accent: boolean }) {
  return (
    <div className="animate-fade-up space-y-6 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl"
        style={{ background: accent ? "var(--j-accent)" : "rgba(255,255,255,0.1)" }}
      >
        {accent ? "✓" : "•"}
      </div>
      {page.components.map((c) =>
        c.type === "heading" ? (
          <h1 key={c.id} className="text-3xl font-semibold">
            {c.content}
          </h1>
        ) : (
          <p key={c.id} className="mx-auto max-w-md text-lg text-white/70">
            {c.content}
          </p>
        ),
      )}
    </div>
  );
}

// Local re-export to avoid importing the whole engine into the client bundle
// for a single call; keeps the player self-contained.
function evalVisible(page: Page, def: JourneyDefinition, answers: Answers): boolean {
  return isComponentVisible({ id: page.id, type: "paragraph", condition: page.condition }, def, answers);
}
