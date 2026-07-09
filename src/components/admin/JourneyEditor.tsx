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

const OPTION_TYPES = new Set(["singleSelect", "radio", "dropdown", "multiSelect", "checkbox"]);
const CONTENT_TYPES = new Set(["heading", "paragraph"]);

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
          <div className="flex gap-6">
            <ColorField
              label="Background"
              value={def.theme?.colorBackground ?? "#0b1f3a"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorBackground = v))}
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
          </div>

          {/* Side image overlay (trust signals over the photo) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <div className="text-xs font-medium text-gray-500">Side image overlay (trust signals)</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className={input}
                placeholder="Title (e.g. Injured in an accident?)"
                value={def.theme?.sideOverlay?.title ?? ""}
                onChange={(e) =>
                  mutate((d) => void (((d.theme ??= {}).sideOverlay ??= {}).title = e.target.value || undefined))
                }
              />
              <input
                className={input}
                placeholder="Subtitle (e.g. No Win, No Fee.)"
                value={def.theme?.sideOverlay?.subtitle ?? ""}
                onChange={(e) =>
                  mutate((d) => void (((d.theme ??= {}).sideOverlay ??= {}).subtitle = e.target.value || undefined))
                }
              />
            </div>
            <div className="mt-2 space-y-2">
              {(def.theme?.sideOverlay?.bullets ?? []).map((b, i) => (
                <div key={i} className="flex items-center gap-2">
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
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-gray-500">Continue button text</label>
                <input
                  className={input}
                  placeholder="Continue"
                  value={page.continueLabel ?? ""}
                  onChange={(e) => mutate((d) => void (d.pages[pi]!.continueLabel = e.target.value || undefined))}
                />
                <EsBox es={es} k={tk.continue(page.id)} placeholder="Continue — Spanish" />
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
                  + Add question to this screen
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
  onOptionLabel,
  onOptionGoTo,
  onAddOption,
  onRemoveOption,
  onStats,
  onRemove,
}: {
  component: Component;
  pages: PageRef[];
  currentPageId: string;
  es: EsHelpers;
  onField: (field: string, value: string) => void;
  onRequired: (req: boolean) => void;
  onOptionLabel: (oi: number, value: string) => void;
  onOptionGoTo: (oi: number, goTo: string) => void;
  onAddOption: () => void;
  onRemoveOption: (oi: number) => void;
  onStats?: (stats: Array<{ value: string; label: string; icon?: string }>) => void;
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
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
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
          ))}
          <button
            onClick={() => onStats?.([...stats, { value: "100+", label: "New stat" }])}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add stat
          </button>
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
          rows={component.type === "paragraph" ? 3 : 1}
          value={component.content ?? ""}
          onChange={(e) => onField("content", e.target.value)}
        />
        <EsBox es={es} k={tk.content(component.id)} placeholder="Spanish" />
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
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          className="accent-blue-600"
          checked={Boolean(component.validation?.required)}
          onChange={(e) => onRequired(e.target.checked)}
        />
        Required
      </label>

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
