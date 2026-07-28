"use client";

// Structured journey editor (builder-lite). Edits the journey's name, theme,
// and its pages/questions/options directly, then saves the whole definition
// (validated server-side against the canonical schema). A full drag-and-drop
// canvas is the roadmap; this makes journeys genuinely editable today.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Component, JourneyDefinition, Page } from "@/modules/journeys/domain/schema";
import { tk } from "@/modules/journeys/domain/i18n";
import { collectStrings } from "@/modules/journeys/domain/strings";
import { DeleteJourneyButton } from "@/components/admin/DeleteJourneyButton";

const OPTION_TYPES = new Set(["singleSelect", "radio", "dropdown", "multiSelect", "checkbox"]);
// Open-ended text answers can toggle between one line (shortText) and a
// paragraph (longText).
const TEXT_ANSWER_TYPES = new Set(["shortText", "longText"]);
const CONTENT_TYPES = new Set(["heading", "paragraph"]);
// Compact inputs can share a row two-up on the live form; offer a "Full width"
// toggle for them. Must mirror COMPACT_FIELDS in the runtime player.
const COMPACT_INPUT_TYPES = new Set(["shortText", "email", "phone", "number", "currency", "date", "time"]);
// Quick-pick icons for the trust bar. Any emoji works in the icon box; these
// are one-click shortcuts for common legal / trust signals.
const ICON_CHOICES = ["⭐", "⚖️", "💰", "💵", "🏆", "🛡️", "✅", "📞", "🤝", "❤️", "👩‍⚖️", "📅", "🚚", "⏱️"];

type EsHelpers = { esEnabled: boolean; getEs: (key: string) => string; setEs: (key: string, val: string) => void };

const controlBase =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const input = `${controlBase} w-full`;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function JourneyEditor({
  slug,
  orgSlug,
  initial,
}: {
  slug: string;
  orgSlug: string;
  initial: JourneyDefinition;
}) {
  const router = useRouter();
  const [def, setDef] = useState<JourneyDefinition>(() => clone(initial));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [xlateMsg, setXlateMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  function mutate(fn: (d: JourneyDefinition) => void) {
    setDef((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
    setStatus(null);
  }

  const esEnabled = (def.languages ?? ["en"]).includes("es");
  const es: EsHelpers = {
    esEnabled,
    getEs: (key) => def.i18n?.es?.[key] ?? "",
    setEs: (key, val) =>
      mutate((d) => {
        d.i18n ??= {};
        d.i18n.es ??= {};
        if (val) d.i18n.es[key] = val;
        else delete d.i18n.es[key];
      }),
  };

  function toggleSpanish(on: boolean) {
    mutate((d) => {
      d.languages = on ? ["en", "es"] : ["en"];
      if (!on) delete d.i18n;
    });
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/journeys/${slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: def.name, definition: def }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      setStatus({ kind: "ok", msg: "Saved." });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  // Auto-fill the Spanish (i18n.es) entries from the current English content via
  // the LLM. Only fills boxes that are still empty, so it never clobbers edits or
  // reviewed translations — clear a box to have it re-translated. Nothing is
  // saved; the admin reviews the filled boxes and Saves as usual.
  async function translateToSpanish() {
    setTranslating(true);
    setXlateMsg(null);
    try {
      const missing = collectStrings(def).filter((s) => !(def.i18n?.es?.[s.key] ?? "").trim());
      if (missing.length === 0) {
        setXlateMsg({ kind: "ok", msg: "Every field already has Spanish text. Clear a box to re-translate it." });
        return;
      }
      const res = await fetch(`/api/admin/journeys/${slug}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetLocale: "es", items: missing }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Translation failed.");
      const translations = (data.translations ?? {}) as Record<string, string>;
      const entries = Object.entries(translations).filter(([, v]) => v && v.trim());
      mutate((d) => {
        d.i18n ??= {};
        d.i18n.es ??= {};
        for (const [k, v] of entries) d.i18n.es[k] = v;
      });
      setXlateMsg({
        kind: "ok",
        msg: `Translated ${entries.length} field${entries.length === 1 ? "" : "s"} — review below, then Save.`,
      });
    } catch (e) {
      setXlateMsg({ kind: "err", msg: e instanceof Error ? e.message : "Translation failed." });
    } finally {
      setTranslating(false);
    }
  }

  const terminalTypes = new Set(["review", "success", "referral", "decline", "end"]);
  const pageList = def.pages.map((p) => ({ id: p.id, name: p.name, type: p.type }));

  function addQuestion() {
    mutate((d) => {
      const id = `q_${Math.random().toString(36).slice(2, 8)}`;
      const page: Page = {
        id: `page_${id}`,
        name: "New question",
        type: "question",
        components: [
          {
            id: id,
            type: "singleSelect",
            key: id,
            label: "New question",
            validation: { required: true },
            options: [
              { label: "Option 1", value: "option_1" },
              { label: "Option 2", value: "option_2" },
            ],
          } as Component,
        ],
      };
      const firstTerminal = d.pages.findIndex((p) => terminalTypes.has(p.type));
      if (firstTerminal === -1) d.pages.push(page);
      else d.pages.splice(firstTerminal, 0, page);
    });
  }

  function addWelcome() {
    mutate((d) => {
      const id = `welcome_${Math.random().toString(36).slice(2, 8)}`;
      d.pages.unshift({
        id: `page_${id}`,
        name: "Welcome",
        type: "statement",
        components: [
          { id: `${id}-h`, type: "heading", content: "Welcome" },
          { id: `${id}-p`, type: "paragraph", content: "Answer a few quick questions to get started." },
        ],
      });
    });
  }

  function addField(pi: number) {
    mutate((d) => {
      const id = `q_${Math.random().toString(36).slice(2, 8)}`;
      d.pages[pi]!.components.push({
        id,
        type: "singleSelect",
        key: id,
        label: "New question",
        validation: { required: true },
        options: [
          { label: "Option 1", value: "option_1" },
          { label: "Option 2", value: "option_2" },
        ],
      } as Component);
    });
  }

  function addOpenEnded(pi: number) {
    mutate((d) => {
      const id = `q_${Math.random().toString(36).slice(2, 8)}`;
      d.pages[pi]!.components.push({
        id,
        type: "longText",
        key: id,
        label: "Your question here",
        placeholder: "Type your answer…",
        validation: { required: true },
      } as Component);
    });
  }

  function addContactFields(pi: number) {
    mutate((d) => {
      const rnd = () => Math.random().toString(36).slice(2, 8);
      // Standard contact block. The keys/types match how leads are read:
      // full_name → the lead's name, an email-type field → email, a phone-type
      // field → phone. This mirrors the built-in templates' contact page.
      d.pages[pi]!.components.push(
        {
          id: `name_${rnd()}`,
          type: "shortText",
          key: "full_name",
          label: "Full name",
          placeholder: "Jane Doe",
          validation: { required: true },
        },
        {
          id: `phone_${rnd()}`,
          type: "phone",
          key: "phone",
          label: "Phone number",
          placeholder: "(512) 555-0100",
          validation: { required: true },
        },
        {
          id: `email_${rnd()}`,
          type: "email",
          key: "email",
          label: "Email address",
          placeholder: "you@example.com",
          validation: { required: true },
        },
        {
          id: `msg_${rnd()}`,
          type: "longText",
          key: "description",
          label: "Anything else we should know? (optional)",
        } as Component,
      );
    });
  }

  function addPrompt(pi: number) {
    mutate((d) => {
      const id = `prompt_${Math.random().toString(36).slice(2, 8)}`;
      // A compact, accented prompt line (level-2 heading). Insert it just above
      // the first input field so it reads as a lead-in to the form.
      const comps = d.pages[pi]!.components;
      const firstField = comps.findIndex((c) => Boolean(c.key));
      const at = firstField === -1 ? comps.length : firstField;
      comps.splice(at, 0, {
        id,
        type: "heading",
        content: "Who are you?",
        props: { level: 2 },
      } as Component);
    });
  }

  function addStats(pi: number) {
    mutate((d) => {
      const id = `stats_${Math.random().toString(36).slice(2, 8)}`;
      d.pages[pi]!.components.push({
        id,
        type: "stats",
        stats: [
          { value: "200+", label: "Google Reviews", icon: "⭐" },
          { value: "$50M+", label: "Won for our Clients" },
          { value: "33+", label: "Years of Experience" },
        ],
      } as Component);
    });
  }

  function addEnding() {
    mutate((d) => {
      const id = `end_${Math.random().toString(36).slice(2, 8)}`;
      d.pages.push({
        id: `page_${id}`,
        name: "Ending",
        type: "end",
        cta: [{ label: "Call Us Now", type: "call", value: "+15125550100", style: "primary" }],
        components: [
          { id: `${id}-h`, type: "heading", content: "Your case has been submitted!" },
          { id: `${id}-p`, type: "paragraph", content: "We'll review your case and be in touch soon." },
        ],
      });
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center justify-between">
        <Link href="/admin/journeys" className="text-sm text-gray-500 hover:text-gray-900">
          ← Journeys
        </Link>
        <div className="flex items-center gap-3">
          <DeleteJourneyButton slug={slug} name={def.name} />
          <Link
            href={`/j/${slug}?org=${orgSlug}`}
            target="_blank"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            Preview ↗
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {status && (
        <div
          className={`mt-4 rounded-lg px-4 py-2.5 text-sm ${
            status.kind === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {status.msg}
        </div>
      )}

      {/* Journey settings */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">Journey</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              className={input}
              value={def.name}
              onChange={(e) => mutate((d) => void (d.name = e.target.value))}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <ColorField
              label="Background"
              value={def.theme?.colorBackground ?? "#0b1f3a"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorBackground = v))}
            />
            <ColorField
              label="Surface"
              value={def.theme?.colorSurface ?? def.theme?.colorBackground ?? "#0b1f3a"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorSurface = v))}
            />
            <ColorField
              label="Text"
              value={def.theme?.colorText ?? "#ffffff"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorText = v))}
            />
            <ColorField
              label="Accent"
              value={def.theme?.colorAccent ?? "#e63946"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorAccent = v))}
            />
          </div>
          <p className="text-xs text-gray-400">
            <strong>Background</strong> is the page color behind everything. <strong>Surface</strong> is the fill for
            cards and form inputs on inner pages — usually the same as the background (leave it matching for a flat
            look, or lighten it slightly to make cards stand out).
          </p>
          {/* Answer (choice) buttons */}
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Answer buttons</div>
          <div className="flex flex-wrap gap-6">
            <ColorField
              label="Button"
              value={def.theme?.buttonBg ?? def.theme?.colorSurface ?? "#ffffff"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).buttonBg = v))}
            />
            <ColorField
              label="Button text"
              value={def.theme?.buttonText ?? def.theme?.colorText ?? "#0b1f3a"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).buttonText = v))}
            />
            <ColorField
              label="Button hover"
              value={def.theme?.buttonHoverBg ?? def.theme?.colorText ?? "#0b1f3a"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).buttonHoverBg = v))}
            />
            <ColorField
              label="Button hover text"
              value={def.theme?.buttonHoverText ?? def.theme?.colorBackground ?? "#ffffff"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).buttonHoverText = v))}
            />
          </div>

          {/* The two action buttons (Call = filled, Start = outlined) */}
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Call &amp; Start buttons
          </div>
          <div className="flex flex-wrap gap-6">
            <ColorField
              label="Call button (fill)"
              value={def.theme?.ctaPrimaryBg ?? def.theme?.buttonBg ?? def.theme?.colorAccent ?? "#c1322f"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaPrimaryBg = v))}
            />
            <ColorField
              label="Call button text"
              value={def.theme?.ctaPrimaryText ?? def.theme?.buttonText ?? "#ffffff"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaPrimaryText = v))}
            />
            <ColorField
              label="Start button (text & border)"
              value={def.theme?.ctaSecondaryColor ?? def.theme?.colorAccent ?? def.theme?.colorText ?? "#c1322f"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaSecondaryColor = v))}
            />
          </div>
          <p className="text-xs text-gray-400">
            &ldquo;Call button&rdquo; is the filled button. &ldquo;Start button (text &amp; border)&rdquo; sets the
            outlined button&rsquo;s font and border color.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Logo URL</label>
              <input
                className={input}
                placeholder="https://…/logo.png"
                value={def.theme?.logoUrl ?? ""}
                onChange={(e) => mutate((d) => void ((d.theme ??= {}).logoUrl = e.target.value || undefined))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Logo link <span className="text-gray-400">(clickable)</span>
              </label>
              <input
                className={input}
                placeholder="https://yourfirm.com"
                value={def.theme?.logoLink ?? ""}
                onChange={(e) => mutate((d) => void ((d.theme ??= {}).logoLink = e.target.value || undefined))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Side image URL <span className="text-gray-400">(shown on the left on desktop)</span>
            </label>
            <input
              className={input}
              placeholder="https://…/photo.jpg"
              value={def.theme?.sideImageUrl ?? ""}
              onChange={(e) =>
                mutate((d) => void ((d.theme ??= {}).sideImageUrl = e.target.value || undefined))
              }
            />
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Social preview image URL{" "}
                <span className="text-gray-400">(link previews; 1200×630. Falls back to the side image)</span>
              </label>
              <input
                className={input}
                placeholder="https://…/share.jpg"
                value={def.theme?.socialImageUrl ?? ""}
                onChange={(e) =>
                  mutate((d) => void ((d.theme ??= {}).socialImageUrl = e.target.value || undefined))
                }
              />
              <p className="mt-1 text-xs text-gray-400">
                Must be a public URL (not an uploaded data image) for previews to show it.
              </p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Photo focus — mobile <span className="text-gray-400">(x% y%, e.g. 70% 60%)</span>
                </label>
                <input
                  className={input}
                  placeholder="50% 35%"
                  value={def.theme?.heroPosition ?? ""}
                  onChange={(e) =>
                    mutate((d) => void ((d.theme ??= {}).heroPosition = e.target.value || undefined))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Zoom — mobile <span className="text-gray-400">(1 = fit, 1.3 = +30%)</span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  max="2"
                  className={input}
                  placeholder="1"
                  value={def.theme?.heroScale ?? ""}
                  onChange={(e) =>
                    mutate(
                      (d) =>
                        void ((d.theme ??= {}).heroScale = e.target.value ? Number(e.target.value) : undefined),
                    )
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Photo focus — desktop <span className="text-gray-400">(independent of mobile)</span>
                </label>
                <input
                  className={input}
                  placeholder="50% 30%"
                  value={def.theme?.heroPositionDesktop ?? ""}
                  onChange={(e) =>
                    mutate((d) => void ((d.theme ??= {}).heroPositionDesktop = e.target.value || undefined))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Zoom — desktop <span className="text-gray-400">(1 = fit)</span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  max="2"
                  className={input}
                  placeholder="1"
                  value={def.theme?.heroScaleDesktop ?? ""}
                  onChange={(e) =>
                    mutate(
                      (d) =>
                        void ((d.theme ??= {}).heroScaleDesktop = e.target.value
                          ? Number(e.target.value)
                          : undefined),
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* Side image overlay (trust signals over the photo) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="text-xs font-medium text-gray-500">Side image overlay (trust signals)</div>
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Name position — mobile{" "}
                <span className="text-gray-400">(0 = top, higher = lower; set high to sit above the heading)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="70"
                  step="1"
                  className="flex-1 accent-blue-600"
                  value={def.theme?.heroNameYMobile ?? 22}
                  onChange={(e) => mutate((d) => void ((d.theme ??= {}).heroNameYMobile = Number(e.target.value)))}
                />
                <span className="w-10 shrink-0 text-right text-xs text-gray-500">
                  {def.theme?.heroNameYMobile ?? 22}%
                </span>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <input
                  className={input}
                  placeholder="Title (e.g. Injured in an accident?)"
                  value={def.theme?.sideOverlay?.title ?? ""}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).sideOverlay ??= {}).title = e.target.value || undefined))
                  }
                />
                <EsBox es={es} k={tk.overlayTitle()} placeholder="Title — Spanish" />
              </div>
              <div>
                <input
                  className={input}
                  placeholder="Subtitle (e.g. No Win, No Fee.)"
                  value={def.theme?.sideOverlay?.subtitle ?? ""}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).sideOverlay ??= {}).subtitle = e.target.value || undefined))
                  }
                />
                <EsBox es={es} k={tk.overlaySubtitle()} placeholder="Subtitle — Spanish" />
              </div>
            </div>
            <input
              className={`${input} mt-2`}
              placeholder="Extra message (under the name on desktop / under the headline on mobile)"
              value={def.theme?.sideOverlay?.message ?? ""}
              onChange={(e) =>
                mutate((d) => void (((d.theme ??= {}).sideOverlay ??= {}).message = e.target.value || undefined))
              }
            />
            <EsBox es={es} k={tk.overlayMessage()} placeholder="Extra message — Spanish" />
            <div className="mt-2 space-y-2">
              {(def.theme?.sideOverlay?.bullets ?? []).map((b, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">★</span>
                    <input
                      className={`${controlBase} min-w-0 flex-1`}
                      placeholder="No Fee Unless We Win Your Case"
                      value={b}
                      onChange={(e) =>
                        mutate((d) => {
                          const ov = ((d.theme ??= {}).sideOverlay ??= {});
                          ov.bullets = (ov.bullets ?? []).map((x, j) => (j === i ? e.target.value : x));
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        mutate((d) => {
                          const ov = ((d.theme ??= {}).sideOverlay ??= {});
                          ov.bullets = (ov.bullets ?? []).filter((_, j) => j !== i);
                        })
                      }
                      className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Remove bullet"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="pl-6">
                    <EsBox es={es} k={tk.overlayBullet(i)} placeholder="Trust signal — Spanish" />
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  mutate((d) => {
                    const ov = ((d.theme ??= {}).sideOverlay ??= {});
                    ov.bullets = [...(ov.bullets ?? []), "New trust signal"];
                  })
                }
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add trust signal
              </button>
            </div>
          </div>

          {/* Desktop callback card — a quick contact form shown under the
              action buttons on desktop (hidden on mobile). */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-500">Desktop callback card</div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={def.theme?.callback?.enabled ?? false}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).callback ??= {}).enabled = e.target.checked))
                  }
                />
                Show
              </label>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              A name / phone / email / message form under the buttons on desktop (hidden on mobile). Turn it on
              here — no need to add fields to the page.
            </p>
            <div className="mt-2 space-y-2">
              <input
                className={input}
                placeholder="Divider heading — Prefer a quick callback? Leave your information."
                value={def.theme?.callback?.heading ?? ""}
                onChange={(e) =>
                  mutate((d) => void (((d.theme ??= {}).callback ??= {}).heading = e.target.value || undefined))
                }
              />
              <EsBox es={es} k={tk.callbackHeading()} placeholder="Divider heading — Spanish" />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <input
                    className={input}
                    placeholder="Button label — Request callback"
                    value={def.theme?.callback?.buttonLabel ?? ""}
                    onChange={(e) =>
                      mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonLabel = e.target.value || undefined))
                    }
                  />
                  <EsBox es={es} k={tk.callbackButton()} placeholder="Button label — Spanish" />
                </div>
                <div>
                  <input
                    className={input}
                    placeholder="Button second line — We'll reach out shortly"
                    value={def.theme?.callback?.buttonSubtitle ?? ""}
                    onChange={(e) =>
                      mutate(
                        (d) =>
                          void (((d.theme ??= {}).callback ??= {}).buttonSubtitle = e.target.value || undefined),
                      )
                    }
                  />
                  <EsBox es={es} k={tk.callbackButtonSub()} placeholder="Second line — Spanish" />
                </div>
              </div>
              <input
                className={input}
                placeholder="Secure footer — Your information is secure and will never be shared."
                value={def.theme?.callback?.secureText ?? ""}
                onChange={(e) =>
                  mutate((d) => void (((d.theme ??= {}).callback ??= {}).secureText = e.target.value || undefined))
                }
              />
              <EsBox es={es} k={tk.callbackSecure()} placeholder="Secure footer — Spanish" />

              <div className="mt-1 flex flex-wrap items-start gap-6 border-t border-gray-200 pt-3">
                <ColorField
                  label="Callback button (fill)"
                  value={def.theme?.callback?.buttonBg ?? def.theme?.colorAccent ?? "#e63946"}
                  onChange={(v) => mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonBg = v))}
                />
                <ColorField
                  label="Callback button text"
                  value={def.theme?.callback?.buttonText ?? "#ffffff"}
                  onChange={(v) => mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonText = v))}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <input
                      type="checkbox"
                      checked={Boolean(def.theme?.callback?.buttonBorderColor)}
                      onChange={(e) =>
                        mutate(
                          (d) =>
                            void (((d.theme ??= {}).callback ??= {}).buttonBorderColor = e.target.checked
                              ? (d.theme?.callback?.buttonBorderColor ?? d.theme?.colorText ?? "#ffffff")
                              : undefined),
                        )
                      }
                    />
                    Border
                  </label>
                  {def.theme?.callback?.buttonBorderColor && (
                    <ColorField
                      label="Border color"
                      value={def.theme.callback.buttonBorderColor}
                      onChange={(v) =>
                        mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonBorderColor = v))
                      }
                    />
                  )}
                </div>
              </div>

              <div className="mt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      def.theme?.callback?.buttonActiveBg ||
                        def.theme?.callback?.buttonActiveText ||
                        def.theme?.callback?.buttonActiveBorderColor,
                    )}
                    onChange={(e) =>
                      mutate((d) => {
                        const cb = ((d.theme ??= {}).callback ??= {});
                        if (e.target.checked) {
                          cb.buttonActiveBg = cb.buttonActiveBg ?? d.theme?.colorAccent ?? "#16a34a";
                        } else {
                          cb.buttonActiveBg = undefined;
                          cb.buttonActiveText = undefined;
                          cb.buttonActiveBorderColor = undefined;
                        }
                      })
                    }
                  />
                  Light up the button once a field is filled
                </label>
                {(def.theme?.callback?.buttonActiveBg ||
                  def.theme?.callback?.buttonActiveText ||
                  def.theme?.callback?.buttonActiveBorderColor) && (
                  <div className="mt-2 flex flex-wrap items-start gap-6">
                    <ColorField
                      label="Active fill"
                      value={def.theme?.callback?.buttonActiveBg ?? def.theme?.colorAccent ?? "#16a34a"}
                      onChange={(v) => mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonActiveBg = v))}
                    />
                    <ColorField
                      label="Active text"
                      value={def.theme?.callback?.buttonActiveText ?? def.theme?.callback?.buttonText ?? "#ffffff"}
                      onChange={(v) => mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonActiveText = v))}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
                        <input
                          type="checkbox"
                          checked={Boolean(def.theme?.callback?.buttonActiveBorderColor)}
                          onChange={(e) =>
                            mutate(
                              (d) =>
                                void (((d.theme ??= {}).callback ??= {}).buttonActiveBorderColor = e.target.checked
                                  ? (d.theme?.callback?.buttonActiveBorderColor ?? d.theme?.colorText ?? "#ffffff")
                                  : undefined),
                            )
                          }
                        />
                        Active border
                      </label>
                      {def.theme?.callback?.buttonActiveBorderColor && (
                        <ColorField
                          label="Active border color"
                          value={def.theme.callback.buttonActiveBorderColor}
                          onChange={(v) =>
                            mutate((d) => void (((d.theme ??= {}).callback ??= {}).buttonActiveBorderColor = v))
                          }
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Below-the-fold optional sections (FAQ + reviews) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="text-xs font-medium text-gray-500">Below the fold (optional)</div>
            <p className="mt-0.5 text-xs text-gray-400">
              Extra sections visitors reach by scrolling down on the landing screen. These never change the main
              above-the-fold layout.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Show first
                <select
                  className={`${controlBase} py-1`}
                  value={def.theme?.belowFold?.reviewsFirst ? "reviews" : "faq"}
                  onChange={(e) =>
                    mutate(
                      (d) => void (((d.theme ??= {}).belowFold ??= {}).reviewsFirst = e.target.value === "reviews"),
                    )
                  }
                >
                  <option value="faq">FAQs</option>
                  <option value="reviews">Reviews</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={def.theme?.belowFold?.showCta ?? false}
                  onChange={(e) => mutate((d) => void (((d.theme ??= {}).belowFold ??= {}).showCta = e.target.checked))}
                />
                Repeat the Call / Start buttons at the bottom
              </label>
            </div>

            {/* FAQs */}
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <label className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">FAQs</span>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={def.theme?.faq?.enabled ?? false}
                    onChange={(e) => mutate((d) => void (((d.theme ??= {}).faq ??= {}).enabled = e.target.checked))}
                  />
                  Show
                </span>
              </label>
              <input
                className={`${input} mt-2`}
                placeholder="Section heading (e.g. Frequently Asked Questions)"
                value={def.theme?.faq?.heading ?? ""}
                onChange={(e) =>
                  mutate((d) => void (((d.theme ??= {}).faq ??= {}).heading = e.target.value || undefined))
                }
              />
              <EsBox es={es} k={tk.faqHeading()} placeholder="Heading — Spanish" />
              <div className="mt-2 space-y-2">
                {(def.theme?.faq?.items ?? []).map((it, i) => (
                  <div key={i} className="rounded border border-gray-100 bg-gray-50/50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${controlBase} min-w-0 flex-1`}
                        placeholder="Question"
                        value={it.q}
                        onChange={(e) =>
                          mutate((d) => {
                            const f = ((d.theme ??= {}).faq ??= {});
                            f.items = (f.items ?? []).map((x, j) => (j === i ? { ...x, q: e.target.value } : x));
                          })
                        }
                      />
                      <button
                        onClick={() =>
                          mutate((d) => {
                            const f = ((d.theme ??= {}).faq ??= {});
                            f.items = (f.items ?? []).filter((_, j) => j !== i);
                          })
                        }
                        className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Remove FAQ"
                      >
                        ✕
                      </button>
                    </div>
                    <EsBox es={es} k={tk.faqQuestion(i)} placeholder="Question — Spanish" />
                    <textarea
                      className={`${input} mt-1`}
                      rows={2}
                      placeholder="Answer"
                      value={it.a}
                      onChange={(e) =>
                        mutate((d) => {
                          const f = ((d.theme ??= {}).faq ??= {});
                          f.items = (f.items ?? []).map((x, j) => (j === i ? { ...x, a: e.target.value } : x));
                        })
                      }
                    />
                    <EsBox es={es} k={tk.faqAnswer(i)} placeholder="Answer — Spanish" />
                  </div>
                ))}
                <button
                  onClick={() =>
                    mutate((d) => {
                      const f = ((d.theme ??= {}).faq ??= {});
                      f.items = [...(f.items ?? []), { q: "New question?", a: "Answer here." }];
                    })
                  }
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add FAQ
                </button>
              </div>
              <div className="mt-3 border-t border-gray-100 pt-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">Disclaimer (optional)</label>
                <textarea
                  className={input}
                  rows={2}
                  placeholder="e.g. The information on this page is for general informational purposes only…"
                  value={def.theme?.faq?.disclaimer ?? ""}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).faq ??= {}).disclaimer = e.target.value || undefined))
                  }
                />
                <EsBox es={es} k={tk.faqDisclaimer()} placeholder="Disclaimer — Spanish" />
              </div>
            </div>

            {/* Reviews */}
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <label className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Reviews (auto-scroll)</span>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={def.theme?.reviews?.enabled ?? false}
                    onChange={(e) =>
                      mutate((d) => void (((d.theme ??= {}).reviews ??= {}).enabled = e.target.checked))
                    }
                  />
                  Show
                </span>
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <input
                    className={input}
                    placeholder="Section heading (optional)"
                    value={def.theme?.reviews?.heading ?? ""}
                    onChange={(e) =>
                      mutate((d) => void (((d.theme ??= {}).reviews ??= {}).heading = e.target.value || undefined))
                    }
                  />
                  <EsBox es={es} k={tk.reviewsHeading()} placeholder="Heading — Spanish" />
                </div>
                <label className="text-xs text-gray-500">
                  Rotate every
                  <input
                    type="number"
                    min="3"
                    max="60"
                    className={`${controlBase} ml-2 w-16`}
                    placeholder="10"
                    value={def.theme?.reviews?.intervalSeconds ?? ""}
                    onChange={(e) =>
                      mutate(
                        (d) =>
                          void (((d.theme ??= {}).reviews ??= {}).intervalSeconds = e.target.value
                            ? Number(e.target.value)
                            : undefined),
                      )
                    }
                  />{" "}
                  s
                </label>
              </div>
              <div className="mt-2 space-y-2">
                {(def.theme?.reviews?.items ?? []).map((r, i) => (
                  <div key={i} className="rounded border border-gray-100 bg-gray-50/50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${controlBase} min-w-0 flex-1`}
                        placeholder="Reviewer name (e.g. L. G.)"
                        value={r.name}
                        onChange={(e) =>
                          mutate((d) => {
                            const rv = ((d.theme ??= {}).reviews ??= {});
                            rv.items = (rv.items ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x));
                          })
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className={`${controlBase} w-16 shrink-0`}
                        placeholder="5★"
                        value={r.rating ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const rv = ((d.theme ??= {}).reviews ??= {});
                            rv.items = (rv.items ?? []).map((x, j) =>
                              j === i ? { ...x, rating: e.target.value ? Number(e.target.value) : undefined } : x,
                            );
                          })
                        }
                      />
                      <button
                        onClick={() =>
                          mutate((d) => {
                            const rv = ((d.theme ??= {}).reviews ??= {});
                            rv.items = (rv.items ?? []).filter((_, j) => j !== i);
                          })
                        }
                        className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Remove review"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      className={`${input} mt-1`}
                      rows={2}
                      placeholder="Review text"
                      value={r.text}
                      onChange={(e) =>
                        mutate((d) => {
                          const rv = ((d.theme ??= {}).reviews ??= {});
                          rv.items = (rv.items ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x));
                        })
                      }
                    />
                    <EsBox es={es} k={tk.reviewText(i)} placeholder="Review — Spanish" />
                  </div>
                ))}
                <button
                  onClick={() =>
                    mutate((d) => {
                      const rv = ((d.theme ??= {}).reviews ??= {});
                      rv.items = [...(rv.items ?? []), { name: "A. B.", text: "Great experience!", rating: 5, source: "Google" }];
                    })
                  }
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add review
                </button>
              </div>
            </div>
          </div>

          {/* Top banner (slides down across the whole screen) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-500">Top banner (slides down)</div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={def.theme?.banner?.enabled ?? true}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).banner ??= {}).enabled = e.target.checked))
                  }
                />
                Show
              </label>
            </div>
            <div className="mt-2 space-y-2">
              {(def.theme?.banner?.items ?? []).map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={`${controlBase} min-w-0 flex-1`}
                    placeholder="NO FEES UNLESS WE WIN"
                    value={it}
                    onChange={(e) =>
                      mutate((d) => {
                        const bn = ((d.theme ??= {}).banner ??= {});
                        bn.items = (bn.items ?? []).map((x, j) => (j === i ? e.target.value : x));
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      mutate((d) => {
                        const bn = ((d.theme ??= {}).banner ??= {});
                        bn.items = (bn.items ?? []).filter((_, j) => j !== i);
                      })
                    }
                    className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Remove banner item"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  mutate((d) => {
                    const bn = ((d.theme ??= {}).banner ??= {});
                    bn.items = [...(bn.items ?? []), "AVAILABLE 24/7"];
                  })
                }
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add banner item
              </button>
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <input
                  className={input}
                  placeholder="Call button label (Call Now)"
                  value={def.theme?.banner?.phoneLabel ?? ""}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).banner ??= {}).phoneLabel = e.target.value || undefined))
                  }
                />
                <input
                  className={input}
                  placeholder="Phone (+15129555457)"
                  value={def.theme?.banner?.phone ?? ""}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).banner ??= {}).phone = e.target.value || undefined))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-6 pt-1">
                <ColorField
                  label="Bar background"
                  value={def.theme?.banner?.background ?? def.theme?.colorBackground ?? "#ffffff"}
                  onChange={(v) => mutate((d) => void (((d.theme ??= {}).banner ??= {}).background = v))}
                />
                <ColorField
                  label="Bar text"
                  value={def.theme?.banner?.textColor ?? def.theme?.colorText ?? "#0b1f3a"}
                  onChange={(v) => mutate((d) => void (((d.theme ??= {}).banner ??= {}).textColor = v))}
                />
              </div>
              <label className="flex items-center gap-2 pt-1 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={def.theme?.banner?.logoInBar === true}
                  onChange={(e) =>
                    mutate((d) => void (((d.theme ??= {}).banner ??= {}).logoInBar = e.target.checked))
                  }
                />
                Show logo in this bar (larger). Off: logo sits above the form.
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1 text-sm text-gray-700">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={esEnabled}
              onChange={(e) => toggleSpanish(e.target.checked)}
            />
            Enable Spanish (adds an EN/ES toggle for visitors and a Spanish box under each text)
          </label>

          {esEnabled && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={translateToSpanish}
                disabled={translating}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
              >
                {translating ? "Translating…" : "✨ Auto-translate to Spanish"}
              </button>
              <span className="text-xs text-gray-400">
                Fills empty Spanish boxes with AI. Review &amp; edit each, then Save.
              </span>
              {xlateMsg && (
                <span className={`text-xs ${xlateMsg.kind === "ok" ? "text-green-600" : "text-red-600"}`}>
                  {xlateMsg.msg}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pages */}
      <div className="mt-6 space-y-4">
        {def.pages.map((page, pi) => (
          <section key={page.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none"
                  value={page.name}
                  placeholder="Screen name"
                  onChange={(e) => mutate((d) => void (d.pages[pi]!.name = e.target.value))}
                />
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  {page.type}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-gray-400">
                <IconBtn label="Move up" disabled={pi === 0} onClick={() => mutate((d) => swap(d.pages, pi, pi - 1))}>
                  ↑
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={pi === def.pages.length - 1}
                  onClick={() => mutate((d) => swap(d.pages, pi, pi + 1))}
                >
                  ↓
                </IconBtn>
                <IconBtn label="Delete page" onClick={() => mutate((d) => void d.pages.splice(pi, 1))}>
                  ✕
                </IconBtn>
              </div>
            </div>

            {!terminalTypes.has(page.type) && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Start button (advances / submits this screen)
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  The Call button is edited under &ldquo;Buttons&rdquo; further down.
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Start button text</label>
                    <input
                      className={input}
                      placeholder="Continue"
                      value={page.continueLabel ?? ""}
                      onChange={(e) => mutate((d) => void (d.pages[pi]!.continueLabel = e.target.value || undefined))}
                    />
                    <EsBox es={es} k={tk.continue(page.id)} placeholder="Continue — Spanish" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Start button — second line (optional)
                    </label>
                    <input
                      className={input}
                      placeholder="e.g. Takes about 2 minutes"
                      value={page.continueSubtitle ?? ""}
                      onChange={(e) =>
                        mutate((d) => void (d.pages[pi]!.continueSubtitle = e.target.value || undefined))
                      }
                    />
                    <EsBox es={es} k={tk.continueSubtitle(page.id)} placeholder="Helper — Spanish" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Continue button goes to
                  </label>
                  <select
                    className={`${controlBase} w-full sm:w-72`}
                    value={page.advanceTo ?? ""}
                    onChange={(e) =>
                      mutate((d) => void (d.pages[pi]!.advanceTo = e.target.value || undefined))
                    }
                    title="Where the Continue button leads (unless an answer branches elsewhere)"
                  >
                    <option value="">Next screen (default)</option>
                    {pageList
                      .filter((p) => p.id !== page.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {["end", "success", "referral", "decline"].includes(p.type) ? `⚑ ${p.name}` : p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <div className="text-[11px] font-medium text-gray-500">Button colors</div>
                  <div className="mt-2 flex flex-wrap gap-6">
                    <ColorField
                      label="Start button (text & border)"
                      value={def.theme?.ctaSecondaryColor ?? def.theme?.colorAccent ?? def.theme?.colorText ?? "#c1322f"}
                      onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaSecondaryColor = v))}
                    />
                    <ColorField
                      label="Start button hover (fill)"
                      value={
                        def.theme?.ctaSecondaryHoverBg ??
                        def.theme?.ctaSecondaryColor ??
                        def.theme?.colorAccent ??
                        "#c1322f"
                      }
                      onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaSecondaryHoverBg = v))}
                    />
                    <ColorField
                      label="Start button hover text"
                      value={def.theme?.ctaSecondaryHoverText ?? def.theme?.colorBackground ?? "#ffffff"}
                      onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaSecondaryHoverText = v))}
                    />
                    <ColorField
                      label="Call button (fill)"
                      value={def.theme?.ctaPrimaryBg ?? def.theme?.buttonBg ?? def.theme?.colorAccent ?? "#c1322f"}
                      onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaPrimaryBg = v))}
                    />
                    <ColorField
                      label="Call button text"
                      value={def.theme?.ctaPrimaryText ?? def.theme?.buttonText ?? "#ffffff"}
                      onChange={(v) => mutate((d) => void ((d.theme ??= {}).ctaPrimaryText = v))}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    These set the Call &amp; Start button colors for the whole journey.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-5">
              {page.components.map((c, ci) => (
                <ComponentEditor
                  key={c.id}
                  component={c}
                  pages={pageList}
                  currentPageId={page.id}
                  es={es}
                  onField={(field, value) =>
                    mutate((d) => {
                      const comp = d.pages[pi]!.components[ci]! as Record<string, unknown>;
                      comp[field] = value;
                    })
                  }
                  onRequired={(req) =>
                    mutate((d) => {
                      const comp = d.pages[pi]!.components[ci]!;
                      comp.validation = { ...(comp.validation ?? {}), required: req };
                    })
                  }
                  onFull={(full) =>
                    mutate((d) => {
                      const comp = d.pages[pi]!.components[ci]!;
                      comp.props = { ...(comp.props ?? {}), full };
                    })
                  }
                  onOptionLabel={(oi, value) =>
                    mutate((d) => {
                      const opt = d.pages[pi]!.components[ci]!.options![oi]!;
                      opt.label = value;
                      opt.value = slugValue(value);
                    })
                  }
                  onOptionGoTo={(oi, goTo) =>
                    mutate((d) => {
                      d.pages[pi]!.components[ci]!.options![oi]!.goTo = goTo || undefined;
                    })
                  }
                  onAddOption={() =>
                    mutate((d) => {
                      const comp = d.pages[pi]!.components[ci]!;
                      comp.options = [...(comp.options ?? []), { label: "New option", value: `opt_${Date.now()}` }];
                    })
                  }
                  onRemoveOption={(oi) =>
                    mutate((d) => void d.pages[pi]!.components[ci]!.options!.splice(oi, 1))
                  }
                  onStats={(stats) => mutate((d) => void (d.pages[pi]!.components[ci]!.stats = stats))}
                  onLineColors={(colors) =>
                    mutate((d) => {
                      const c = d.pages[pi]!.components[ci]!;
                      const cleaned = colors.some(Boolean) ? colors : undefined;
                      c.props = { ...(c.props ?? {}), lineColors: cleaned };
                    })
                  }
                  onRemove={
                    page.components.length > 1
                      ? () => mutate((d) => void d.pages[pi]!.components.splice(ci, 1))
                      : undefined
                  }
                />
              ))}
            </div>

            {!terminalTypes.has(page.type) && (
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-blue-600">
                <button onClick={() => addField(pi)} className="hover:text-blue-700">
                  + Add question (with answer options)
                </button>
                <button onClick={() => addOpenEnded(pi)} className="hover:text-blue-700">
                  + Add open-ended answer
                </button>
                <button onClick={() => addContactFields(pi)} className="hover:text-blue-700">
                  + Add contact fields
                </button>
                <button onClick={() => addPrompt(pi)} className="hover:text-blue-700">
                  + Add prompt text
                </button>
                <button onClick={() => addStats(pi)} className="hover:text-blue-700">
                  + Add trust bar
                </button>
              </div>
            )}

            {(terminalTypes.has(page.type) || page.type === "statement") && page.type !== "review" && (
              <CtaEditor
                cta={page.cta ?? []}
                pageId={page.id}
                es={es}
                onChange={(cta) => mutate((d) => void (d.pages[pi]!.cta = cta))}
              />
            )}
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={addWelcome}
          className="rounded-full border border-dashed border-gray-300 px-5 py-2.5 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
        >
          + Add welcome screen
        </button>
        <button
          onClick={addQuestion}
          className="rounded-full border border-dashed border-gray-300 px-5 py-2.5 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
        >
          + Add question
        </button>
        <button
          onClick={addEnding}
          className="rounded-full border border-dashed border-gray-300 px-5 py-2.5 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
        >
          + Add ending
        </button>
      </div>
    </div>
  );
}

interface PageRef {
  id: string;
  name: string;
  type: string;
}

function EsBox({ es, k, placeholder }: { es: EsHelpers; k: string; placeholder: string }) {
  if (!es.esEnabled) return null;
  return (
    <input
      className={`${input} mt-1.5 border-dashed`}
      placeholder={`🇪🇸 ${placeholder}`}
      value={es.getEs(k)}
      onChange={(e) => es.setEs(k, e.target.value)}
    />
  );
}

function RemoveField({ onRemove }: { onRemove?: () => void }) {
  if (!onRemove) return null;
  return (
    <button
      onClick={onRemove}
      className="shrink-0 rounded-md px-2 py-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600"
      aria-label="Remove this field"
      title="Remove this field"
    >
      ✕
    </button>
  );
}

function ComponentEditor({
  component,
  pages,
  currentPageId,
  es,
  onField,
  onRequired,
  onFull,
  onOptionLabel,
  onOptionGoTo,
  onAddOption,
  onRemoveOption,
  onStats,
  onLineColors,
  onRemove,
}: {
  component: Component;
  pages: PageRef[];
  currentPageId: string;
  es: EsHelpers;
  onField: (field: string, value: string) => void;
  onRequired: (req: boolean) => void;
  onFull: (full: boolean) => void;
  onOptionLabel: (oi: number, value: string) => void;
  onOptionGoTo: (oi: number, goTo: string) => void;
  onAddOption: () => void;
  onRemoveOption: (oi: number) => void;
  onStats?: (stats: Array<{ value: string; label: string; icon?: string }>) => void;
  onLineColors?: (colors: Array<string | null>) => void;
  onRemove?: () => void;
}) {
  if (component.type === "stats") {
    const stats = component.stats ?? [];
    const set = (i: number, patch: Partial<{ value: string; label: string; icon?: string }>) =>
      onStats?.(stats.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Trust stats (count up)</span>
          <RemoveField onRemove={onRemove} />
        </div>
        <div className="space-y-3">
          {stats.map((s, i) => (
            <div key={i} className="space-y-1.5 rounded-md border border-gray-100 bg-white p-2">
              <div className="flex items-center gap-2">
                <input
                  className={`${controlBase} w-16 shrink-0 text-center`}
                  placeholder="⭐"
                  value={s.icon ?? ""}
                  onChange={(e) => set(i, { icon: e.target.value || undefined })}
                />
                <input
                  className={`${controlBase} w-32 shrink-0`}
                  placeholder="$50M+"
                  value={s.value}
                  onChange={(e) => set(i, { value: e.target.value })}
                />
                <input
                  className={`${controlBase} min-w-0 flex-1`}
                  placeholder="Won for our Clients"
                  value={s.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <button
                  onClick={() => onStats?.(stats.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Remove stat"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 pl-1">
                <span className="mr-1 text-[11px] text-gray-400">Icon:</span>
                {ICON_CHOICES.map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    onClick={() => set(i, { icon: emo })}
                    className={`rounded px-1.5 py-0.5 text-base leading-none hover:bg-gray-100 ${
                      s.icon === emo ? "bg-blue-50 ring-1 ring-blue-300" : ""
                    }`}
                    title={`Use ${emo}`}
                  >
                    {emo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set(i, { icon: undefined })}
                  className="rounded px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100"
                  title="No icon"
                >
                  none
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => onStats?.([...stats, { value: "100+", label: "New stat" }])}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add stat
          </button>
          <p className="text-xs text-gray-400">
            Click an icon above, or type any emoji in the icon box (Windows: Win + . / Mac: Ctrl + Cmd + Space).
          </p>
        </div>
      </div>
    );
  }

  if (CONTENT_TYPES.has(component.type)) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
            {component.type}
          </label>
          <RemoveField onRemove={onRemove} />
        </div>
        <textarea
          className={input}
          rows={component.type === "paragraph" ? 3 : 2}
          value={component.content ?? ""}
          onChange={(e) => onField("content", e.target.value)}
        />
        {component.type === "heading" && (
          <p className="mt-1 text-xs text-gray-400">Press Enter to add a line break.</p>
        )}
        <EsBox es={es} k={tk.content(component.id)} placeholder="Spanish" />
        {component.type === "heading" && onLineColors && (
          <HeadingLineColorsEditor component={component} onLineColors={onLineColors} />
        )}
      </div>
    );
  }

  const hasOptions = OPTION_TYPES.has(component.type);
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
      <div className="flex items-center gap-2">
        <input
          className={`${controlBase} min-w-0 flex-1`}
          placeholder="Question"
          value={component.label ?? ""}
          onChange={(e) => onField("label", e.target.value)}
        />
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] uppercase text-gray-500">
          {component.type}
        </span>
        <RemoveField onRemove={onRemove} />
      </div>
      <EsBox es={es} k={tk.label(component.id)} placeholder="Question — Spanish" />
      <input
        className={`${input} mt-2`}
        placeholder="Help text (optional)"
        value={component.helpText ?? ""}
        onChange={(e) => onField("helpText", e.target.value)}
      />
      <EsBox es={es} k={tk.help(component.id)} placeholder="Help text — Spanish" />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={Boolean(component.validation?.required)}
            onChange={(e) => onRequired(e.target.checked)}
          />
          Required
        </label>
        {TEXT_ANSWER_TYPES.has(component.type) && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Answer:
            <select
              className={`${controlBase} py-1`}
              value={component.type}
              onChange={(e) => onField("type", e.target.value)}
            >
              <option value="shortText">Short answer (one line)</option>
              <option value="longText">Paragraph (multi-line)</option>
            </select>
          </label>
        )}
        {COMPACT_INPUT_TYPES.has(component.type) && (
          <label className="flex items-center gap-2 text-sm text-gray-600" title="Take the full row instead of sharing it with the next field">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={component.props?.full === true}
              onChange={(e) => onFull(e.target.checked)}
            />
            Full width
          </label>
        )}
      </div>

      {hasOptions && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-gray-500">Options — pick where each one leads</div>
          {component.options?.map((o, oi) => (
            <div key={oi} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  className={`${controlBase} min-w-0 flex-1`}
                  placeholder="Answer label"
                  value={o.label}
                  onChange={(e) => onOptionLabel(oi, e.target.value)}
                />
                <span className="shrink-0 text-xs text-gray-400">→</span>
                <select
                  className={`${controlBase} w-40 shrink-0`}
                  value={o.goTo ?? ""}
                  onChange={(e) => onOptionGoTo(oi, e.target.value)}
                  title="Where this answer leads"
                >
                  <option value="">Next screen</option>
                  {pages
                    .filter((p) => p.id !== currentPageId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {["end", "success", "referral", "decline"].includes(p.type) ? `⚑ ${p.name}` : p.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => onRemoveOption(oi)}
                  className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Remove option"
                >
                  ✕
                </button>
              </div>
              <EsBox es={es} k={tk.option(component.id, o.value)} placeholder="Option — Spanish" />
            </div>
          ))}
          <button onClick={onAddOption} className="text-sm text-blue-600 hover:text-blue-700">
            + Add option
          </button>
        </div>
      )}
    </div>
  );
}

type CtaRow = {
  label: string;
  subtitle?: string;
  note?: string;
  type: "call" | "text" | "schedule" | "link" | "custom";
  value: string;
  href?: string;
  style: "primary" | "secondary";
};

function CtaEditor({
  cta,
  pageId,
  es,
  onChange,
}: {
  cta: Array<Partial<CtaRow>>;
  pageId: string;
  es: EsHelpers;
  onChange: (cta: CtaRow[]) => void;
}) {
  const rows: CtaRow[] = cta.map((c) => ({
    label: c.label ?? "",
    subtitle: c.subtitle,
    note: c.note,
    type: c.type ?? (c.href?.startsWith("tel:") ? "call" : "link"),
    value: c.value ?? (c.href ? c.href.replace(/^tel:|^sms:/, "") : ""),
    style: c.style ?? "primary",
  }));
  const set = (i: number, patch: Partial<CtaRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
      <div className="text-xs font-medium text-gray-500">Buttons — up to 5 (call, text, schedule, link)</div>
      <div className="mt-2 space-y-3">
        {rows.map((c, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <select
                className={`${controlBase} w-24 shrink-0`}
                value={c.type}
                onChange={(e) => set(i, { type: e.target.value as CtaRow["type"] })}
              >
                <option value="call">Call</option>
                <option value="text">Text</option>
                <option value="schedule">Schedule</option>
                <option value="link">Link</option>
                <option value="custom">Custom</option>
              </select>
              <input
                className={`${controlBase} min-w-0 flex-1`}
                placeholder="Button label (e.g. Call Us Now)"
                value={c.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <input
                className={`${controlBase} min-w-0 flex-1`}
                placeholder={c.type === "call" || c.type === "text" ? "+15125550100" : "https://…"}
                value={c.value}
                onChange={(e) => set(i, { value: e.target.value })}
              />
              <select
                className={`${controlBase} w-24 shrink-0`}
                value={c.style}
                onChange={(e) => set(i, { style: e.target.value as CtaRow["style"] })}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
              <button
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Remove button"
              >
                ✕
              </button>
            </div>
            <EsBox es={es} k={tk.cta(pageId, i)} placeholder="Button label — Spanish" />
            <div className="flex flex-wrap gap-2">
              <input
                className={`${controlBase} min-w-0 flex-1`}
                placeholder="Second line / helper (e.g. Speak with our team now)"
                value={c.subtitle ?? ""}
                onChange={(e) => set(i, { subtitle: e.target.value || undefined })}
              />
              <input
                className={`${controlBase} w-40 shrink-0`}
                placeholder="Pill (e.g. Available 24/7)"
                value={c.note ?? ""}
                onChange={(e) => set(i, { note: e.target.value || undefined })}
              />
            </div>
            <EsBox es={es} k={tk.ctaSubtitle(pageId, i)} placeholder="Second line — Spanish" />
            <EsBox es={es} k={tk.ctaNote(pageId, i)} placeholder="Pill — Spanish" />
          </div>
        ))}
        {rows.length < 5 && (
          <button
            onClick={() => onChange([...rows, { label: "Call Us Now", type: "call", value: "+1", style: "primary" }])}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add CTA
          </button>
        )}
      </div>
    </div>
  );
}

// Optional accent color per line of a heading. The text is authored in the
// content box above (each newline is a line); this just tints those lines.
function HeadingLineColorsEditor({
  component,
  onLineColors,
}: {
  component: Component;
  onLineColors: (colors: Array<string | null>) => void;
}) {
  const textLines = (component.content ?? "").split("\n");
  const stored = (component.props?.lineColors as Array<string | null | undefined> | undefined) ?? [];
  const colors = textLines.map((_, i) => (typeof stored[i] === "string" ? (stored[i] as string) : null));
  const setColor = (i: number, color: string | null) =>
    onLineColors(textLines.map((_, j) => (j === i ? color : (colors[j] ?? null))));
  if (textLines.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-gray-100 bg-gray-50/60 p-3">
      <div className="mb-2 text-xs font-medium text-gray-500">
        Line colors (optional accent — one per line of the text above)
      </div>
      <div className="space-y-1.5">
        {textLines.map((ln, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
              {ln || <span className="italic text-gray-400">(blank line)</span>}
            </span>
            <input
              type="color"
              value={colors[i] ?? "#111827"}
              onChange={(e) => setColor(i, e.target.value)}
              className="h-8 w-9 shrink-0 cursor-pointer rounded border border-gray-300 bg-white"
              title="Line color"
            />
            {colors[i] && (
              <button
                onClick={() => setColor(i, null)}
                className="shrink-0 text-[11px] text-gray-400 hover:text-gray-700"
                title="Use the default heading color"
              >
                auto
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white"
        />
        <span className="font-mono text-xs text-gray-500">{value}</span>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md px-2 py-1 text-sm transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function swap<T>(arr: T[], a: number, b: number) {
  if (b < 0 || b >= arr.length) return;
  const tmp = arr[a]!;
  arr[a] = arr[b]!;
  arr[b] = tmp;
}

function slugValue(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || `opt_${Math.random().toString(36).slice(2, 6)}`
  );
}
