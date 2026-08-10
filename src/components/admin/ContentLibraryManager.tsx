"use client";

// Edits the org's reusable content-block library. Each block is a heading + body
// paragraph (with optional Spanish). Journeys pick a block by id in the journey
// editor; the public runtime resolves it at render. Sibling of FaqLibraryManager.

import { useState } from "react";
import type { ContentBlock } from "@/modules/content/contentBlocks";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function newId() {
  return `content_${Math.random().toString(36).slice(2, 9)}`;
}

export function ContentLibraryManager({ initialBlocks }: { initialBlocks: ContentBlock[] }) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [xlateMsg, setXlateMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function update(id: string, patch: Partial<ContentBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setStatus(null);
  }

  function addBlock() {
    const block: ContentBlock = { id: newId(), name: "New content block", body: "" };
    setBlocks((prev) => [...prev, block]);
    setSelectedId(block.id);
    setStatus(null);
  }
  function deleteBlock(id: string) {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setStatus(null);
  }

  async function translate(overwrite: boolean) {
    if (!selected) return;
    if (
      overwrite &&
      !window.confirm(
        "Re-translate the Spanish for this block and replace what's there? (Nothing is saved until you click Save.)",
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
      add("body", selected.body, selected.bodyEs);
      if (items.length === 0) {
        setXlateMsg({ kind: "ok", msg: "Spanish is already filled. Clear a box to re-translate, or use Re-translate all." });
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
      const patch: Partial<ContentBlock> = {};
      if (t.heading?.trim()) (patch.headingEs = t.heading), n++;
      if (t.body?.trim()) (patch.bodyEs = t.body), n++;
      update(selected.id, patch);
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

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/content-blocks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setBlocks(data.blocks as ContentBlock[]);
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
          {blocks.length === 0 && <option value="">No content blocks yet</option>}
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addBlock}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          + New block
        </button>
      </div>

      {selected ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Block name (internal)</label>
              <input
                className={`${input} w-full`}
                value={selected.name}
                placeholder="e.g. About our firm"
                onChange={(e) => update(selected.id, { name: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => deleteBlock(selected.id)}
              className="mt-6 shrink-0 rounded-lg px-2 py-1 text-sm text-red-500 transition hover:bg-red-50"
            >
              Delete block
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
            <span className="text-xs text-gray-400">Fills the 🇪🇸 boxes; review &amp; edit, then Save.</span>
            {xlateMsg && (
              <span className={`text-xs ${xlateMsg.kind === "ok" ? "text-green-600" : "text-red-600"}`}>
                {xlateMsg.msg}
              </span>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Heading (optional)</label>
            <input
              className={`${input} w-full`}
              placeholder="e.g. Why choose Ramos James Law"
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

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Body</label>
            <textarea
              className={`${input} w-full`}
              rows={5}
              placeholder="Write the paragraph(s). Blank lines separate paragraphs."
              value={selected.body}
              onChange={(e) => update(selected.id, { body: e.target.value })}
            />
            <textarea
              className={`${input} mt-1.5 w-full border-dashed`}
              rows={5}
              placeholder="🇪🇸 Body — Spanish"
              value={selected.bodyEs ?? ""}
              onChange={(e) => update(selected.id, { bodyEs: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No content blocks yet. Create one to reuse across journeys.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save content blocks"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
