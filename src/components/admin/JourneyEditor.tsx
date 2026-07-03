"use client";

// Structured journey editor (builder-lite). Edits the journey's name, theme,
// and its pages/questions/options directly, then saves the whole definition
// (validated server-side against the canonical schema). A full drag-and-drop
// canvas is the roadmap; this makes journeys genuinely editable today.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Component, JourneyDefinition, Page } from "@/modules/journeys/domain/schema";

const OPTION_TYPES = new Set(["singleSelect", "radio", "dropdown", "multiSelect", "checkbox"]);
const CONTENT_TYPES = new Set(["heading", "paragraph"]);

const input =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

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

  const terminalTypes = new Set(["review", "success", "decline"]);

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
              label="Accent"
              value={def.theme?.colorAccent ?? "#e63946"}
              onChange={(v) => mutate((d) => void ((d.theme ??= {}).colorAccent = v))}
            />
          </div>
        </div>
      </section>

      {/* Pages */}
      <div className="mt-6 space-y-4">
        {def.pages.map((page, pi) => (
          <section key={page.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  className="rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none"
                  value={page.name}
                  onChange={(e) => mutate((d) => void (d.pages[pi]!.name = e.target.value))}
                />
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  {page.type}
                </span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
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

            <div className="mt-4 space-y-5">
              {page.components.map((c, ci) => (
                <ComponentEditor
                  key={c.id}
                  component={c}
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
                  onOption={(oi, field, value) =>
                    mutate((d) => {
                      const opt = d.pages[pi]!.components[ci]!.options![oi]! as Record<string, unknown>;
                      opt[field] = field === "score" ? Number(value) || 0 : value;
                      if (field === "label") opt.value = slugValue(String(value));
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
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        onClick={addQuestion}
        className="mt-4 rounded-full border border-dashed border-gray-300 px-5 py-2.5 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
      >
        + Add question
      </button>
    </div>
  );
}

function ComponentEditor({
  component,
  onField,
  onRequired,
  onOption,
  onAddOption,
  onRemoveOption,
}: {
  component: Component;
  onField: (field: string, value: string) => void;
  onRequired: (req: boolean) => void;
  onOption: (oi: number, field: "label" | "score", value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (oi: number) => void;
}) {
  if (CONTENT_TYPES.has(component.type)) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
          {component.type}
        </label>
        <textarea
          className={input}
          rows={component.type === "paragraph" ? 3 : 1}
          value={component.content ?? ""}
          onChange={(e) => onField("content", e.target.value)}
        />
      </div>
    );
  }

  const hasOptions = OPTION_TYPES.has(component.type);
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
      <div className="flex items-center gap-2">
        <input
          className={input}
          placeholder="Question"
          value={component.label ?? ""}
          onChange={(e) => onField("label", e.target.value)}
        />
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] uppercase text-gray-500">
          {component.type}
        </span>
      </div>
      <input
        className={`${input} mt-2`}
        placeholder="Help text (optional)"
        value={component.helpText ?? ""}
        onChange={(e) => onField("helpText", e.target.value)}
      />
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
          <div className="text-xs font-medium text-gray-500">Options (label · score)</div>
          {component.options?.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                className={input}
                value={o.label}
                onChange={(e) => onOption(oi, "label", e.target.value)}
              />
              <input
                type="number"
                className={`${input} w-24`}
                value={o.score ?? 0}
                onChange={(e) => onOption(oi, "score", e.target.value)}
              />
              <button
                onClick={() => onRemoveOption(oi)}
                className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Remove option"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={onAddOption}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add option
          </button>
        </div>
      )}
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
