"use client";

// Edits the org's reusable FAQ library. Each set has a name, an optional heading
// and disclaimer, and a list of Q&A items (with optional Spanish). Journeys pick
// a set by id in the journey editor; the public runtime resolves it at render.

import { useState } from "react";
import type { FaqSet, FaqSetItem } from "@/modules/faq/faqSets";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function newId() {
  return `faq_${Math.random().toString(36).slice(2, 9)}`;
}

export function FaqLibraryManager({ initialSets }: { initialSets: FaqSet[] }) {
  const [sets, setSets] = useState<FaqSet[]>(initialSets);
  const [selectedId, setSelectedId] = useState<string | null>(initialSets[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [xlateMsg, setXlateMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const selected = sets.find((s) => s.id === selectedId) ?? null;

  // Fill the Spanish fields of the selected set via the shared translator. Like
  // the journey editor: the default only fills empty boxes; overwrite replaces
  // every one. Nothing is saved until "Save FAQ library".
  async function translate(overwrite: boolean) {
    if (!selected) return;
    if (
      overwrite &&
      !window.confirm(
        "Re-translate every Spanish box in this set and replace what's there, including edits you've made? " +
          "(Nothing is saved until you click Save FAQ library.)",
      )
    ) {
      return;
    }
    setTranslating(true);
    setXlateMsg(null);
    try {
      const items: Array<{ key: string; text: string }> = [];
      const add = (key: string, text: string | undefined, existingEs: string | undefined) => {
        if (!text?.trim()) return;
        if (!overwrite && existingEs?.trim()) return;
        items.push({ key, text });
      };
      add("heading", selected.heading, selected.headingEs);
      add("disclaimer", selected.disclaimer, selected.disclaimerEs);
      selected.items.forEach((it, i) => {
        add(`q:${i}`, it.q, it.qEs);
        add(`a:${i}`, it.a, it.aEs);
      });
      if (items.length === 0) {
        setXlateMsg({ kind: "ok", msg: "Every box already has Spanish. Clear one to re-translate it, or use Re-translate all." });
        return;
      }
      const res = await fetch("/api/admin/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetLocale: "es", items }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Translation failed.");
      const t = (data.translations ?? {}) as Record<string, string>;
      let n = 0;
      setSets((prev) =>
        prev.map((s) => {
          if (s.id !== selected.id) return s;
          const next = { ...s, items: s.items.map((it) => ({ ...it })) };
          if (t.heading?.trim()) (next.headingEs = t.heading), n++;
          if (t.disclaimer?.trim()) (next.disclaimerEs = t.disclaimer), n++;
          next.items.forEach((it, i) => {
            if (t[`q:${i}`]?.trim()) (it.qEs = t[`q:${i}`]), n++;
            if (t[`a:${i}`]?.trim()) (it.aEs = t[`a:${i}`]), n++;
          });
          return next;
        }),
      );
      setStatus(null);
      setXlateMsg({
        kind: "ok",
        msg: `Translated ${n} box${n === 1 ? "" : "es"}${overwrite ? " (overwritten)" : ""} — review, then Save.`,
      });
    } catch (e) {
      setXlateMsg({ kind: "err", msg: e instanceof Error ? e.message : "Translation failed." });
    } finally {
      setTranslating(false);
    }
  }

  function update(id: string, patch: Partial<FaqSet>) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setStatus(null);
  }
  function updateItem(id: string, i: number, patch: Partial<FaqSetItem>) {
    setSets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } : s)),
    );
    setStatus(null);
  }

  function addSet() {
    const set: FaqSet = { id: newId(), name: "New FAQ set", items: [{ q: "New question?", a: "Answer here." }] };
    setSets((prev) => [...prev, set]);
    setSelectedId(set.id);
    setStatus(null);
  }
  function deleteSet(id: string) {
    setSets((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setStatus(null);
  }
  function addItem(id: string) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, items: [...s.items, { q: "", a: "" }] } : s)));
    setStatus(null);
  }
  function removeItem(id: string, i: number) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, items: s.items.filter((_, j) => j !== i) } : s)));
    setStatus(null);
  }
  function moveItem(id: string, i: number, dir: -1 | 1) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const j = i + dir;
        if (j < 0 || j >= s.items.length) return s;
        const items = [...s.items];
        [items[i], items[j]] = [items[j]!, items[i]!];
        return { ...s, items };
      }),
    );
    setStatus(null);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/faq-sets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sets }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setSets(data.sets as FaqSet[]);
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${input} min-w-0 flex-1`}
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          {sets.length === 0 && <option value="">No FAQ sets yet</option>}
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.items.length})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addSet}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          + New set
        </button>
      </div>

      {selected ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Set name (internal)</label>
              <input
                className={`${input} w-full`}
                value={selected.name}
                placeholder="e.g. Car accident FAQs"
                onChange={(e) => update(selected.id, { name: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => deleteSet(selected.id)}
              className="mt-6 shrink-0 rounded-lg px-2 py-1 text-sm text-red-500 transition hover:bg-red-50"
            >
              Delete set
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3">
            <button
              type="button"
              onClick={() => translate(false)}
              disabled={translating}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {translating ? "Translating…" : "Translate to Spanish"}
            </button>
            <button
              type="button"
              onClick={() => translate(true)}
              disabled={translating}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Re-translate all (overwrite)
            </button>
            <span className="text-xs text-gray-400">
              Fills the 🇪🇸 boxes in this set. First button fills only empty ones; review &amp; edit, then Save.
            </span>
            {xlateMsg && (
              <span className={`text-xs ${xlateMsg.kind === "ok" ? "text-green-600" : "text-red-600"}`}>
                {xlateMsg.msg}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Section heading</label>
              <input
                className={`${input} w-full`}
                placeholder="Frequently Asked Questions"
                value={selected.heading ?? ""}
                onChange={(e) => update(selected.id, { heading: e.target.value })}
              />
              <input
                className={`${input} mt-1.5 w-full border-dashed`}
                placeholder="🇪🇸 Heading — Spanish"
                value={selected.headingEs ?? ""}
                onChange={(e) => update(selected.id, { headingEs: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500">Questions</div>
            {selected.items.map((it, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                <div className="flex items-center gap-2">
                  <input
                    className={`${input} min-w-0 flex-1`}
                    placeholder="Question"
                    value={it.q}
                    onChange={(e) => updateItem(selected.id, i, { q: e.target.value })}
                  />
                  <div className="flex shrink-0 items-center text-gray-400">
                    <button
                      type="button"
                      onClick={() => moveItem(selected.id, i, -1)}
                      disabled={i === 0}
                      className="rounded-md px-1.5 py-1 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(selected.id, i, 1)}
                      disabled={i === selected.items.length - 1}
                      className="rounded-md px-1.5 py-1 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(selected.id, i)}
                    className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Remove question"
                  >
                    ✕
                  </button>
                </div>
                <input
                  className={`${input} mt-1.5 w-full border-dashed`}
                  placeholder="🇪🇸 Question — Spanish"
                  value={it.qEs ?? ""}
                  onChange={(e) => updateItem(selected.id, i, { qEs: e.target.value })}
                />
                <textarea
                  className={`${input} mt-2 w-full`}
                  rows={2}
                  placeholder="Answer"
                  value={it.a}
                  onChange={(e) => updateItem(selected.id, i, { a: e.target.value })}
                />
                <textarea
                  className={`${input} mt-1.5 w-full border-dashed`}
                  rows={2}
                  placeholder="🇪🇸 Answer — Spanish"
                  value={it.aEs ?? ""}
                  onChange={(e) => updateItem(selected.id, i, { aEs: e.target.value })}
                />
              </div>
            ))}
            <button type="button" onClick={() => addItem(selected.id)} className="text-sm text-blue-600 hover:text-blue-700">
              + Add question
            </button>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Disclaimer (optional)</label>
            <textarea
              className={`${input} w-full`}
              rows={2}
              placeholder="e.g. The information on this page is for general informational purposes only…"
              value={selected.disclaimer ?? ""}
              onChange={(e) => update(selected.id, { disclaimer: e.target.value })}
            />
            <textarea
              className={`${input} mt-1.5 w-full border-dashed`}
              rows={2}
              placeholder="🇪🇸 Disclaimer — Spanish"
              value={selected.disclaimerEs ?? ""}
              onChange={(e) => update(selected.id, { disclaimerEs: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No FAQ sets yet. Create one to reuse across journeys.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save FAQ library"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
