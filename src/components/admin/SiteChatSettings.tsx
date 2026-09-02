"use client";

// Per-business chat widget. Paste the vendor's <script> snippet, then choose
// how it appears on desktop vs mobile. "Only in selected sections" uses the
// content block and/or FAQ on the landing page — we apply that to the injected
// script so you don't edit data-show-when by hand.

import { useMemo, useState } from "react";
import {
  parseSiteChatSnippet,
  type SiteChatDeviceMode,
  type SiteChatPlacement,
} from "@/modules/integrations/siteChat";

const input =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const MODES: { value: SiteChatDeviceMode; label: string; hint: string }[] = [
  { value: "always", label: "Always", hint: "Corner bubble on the whole page" },
  { value: "sections", label: "Selected sections", hint: "Only while those blocks are on screen" },
  { value: "off", label: "Hidden", hint: "Don't show on this device" },
];

export function SiteChatSettings({
  initialSnippet,
  initialClientId,
  initialPlacement,
}: {
  initialSnippet: string;
  initialClientId: string;
  initialPlacement: SiteChatPlacement;
}) {
  const [snippet, setSnippet] = useState(initialSnippet);
  const [desktop, setDesktop] = useState<SiteChatDeviceMode>(initialPlacement.desktop);
  const [mobile, setMobile] = useState<SiteChatDeviceMode>(initialPlacement.mobile);
  const [content, setContent] = useState(initialPlacement.content);
  const [faq, setFaq] = useState(initialPlacement.faq);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [clientId, setClientId] = useState(initialClientId);

  const parsed = useMemo(() => parseSiteChatSnippet(snippet), [snippet]);
  const needsSections = desktop === "sections" || mobile === "sections";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/integrations/site-chat", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snippet, placement: { desktop, mobile, content, faq } }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      setSnippet(data.config?.snippet ?? snippet);
      setClientId(data.config?.clientId ?? "");
      const p = data.config?.placement as SiteChatPlacement | undefined;
      if (p) {
        setDesktop(p.desktop);
        setMobile(p.mobile);
        setContent(p.content);
        setFaq(p.faq);
      }
      setStatus({
        kind: "ok",
        msg: data.config?.clientId ? `Saved. Chat flow: ${data.config.clientId}` : "Saved. Chat widget is off.",
      });
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Widget script</label>
        <textarea
          className={`${input} min-h-[8rem] w-full font-mono text-xs leading-relaxed`}
          placeholder={`<script\n  src="https://site-chat-production.up.railway.app/widget.js"\n  data-client-id="your-firm-id"\n  async>\n</script>`}
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-gray-400">
          Paste the script from the chat app (the one with{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">data-client-id</code>). We read the URL and client
          id; display rules below replace <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">data-show-when</code>.
          Leave blank to turn it off.
        </p>
        {clientId ? (
          <p className="mt-1 text-xs text-gray-500">
            Active client: <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">{clientId}</code>
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DeviceMode field="Desktop" value={desktop} onChange={setDesktop} />
        <DeviceMode field="Mobile" value={mobile} onChange={setMobile} />
      </div>

      <div className={needsSections ? "" : "opacity-50"}>
        <div className="text-xs font-medium text-gray-500">Selected sections</div>
        <p className="mt-0.5 text-xs text-gray-400">
          Used when Desktop or Mobile is set to Selected sections. The bubble shows while any checked block is on
          screen.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={content}
              disabled={!needsSections}
              onChange={(e) => setContent(e.target.checked)}
            />
            Content block
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={faq}
              disabled={!needsSections}
              onChange={(e) => setFaq(e.target.checked)}
            />
            FAQ
          </label>
        </div>
      </div>

      {parsed && (
        <div>
          <div className="text-xs font-medium text-gray-500">Injected script</div>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-700">
            {`<script
  src="${parsed.src}"
  data-client-id="${parsed.clientId}"
  data-open-on-load="false"
  async>
</script>`}
          </pre>
          <p className="mt-1 text-xs text-gray-400">
            Desktop: {modeLabel(desktop)}
            {desktop === "sections" ? ` (${sectionList(content, faq)})` : ""}
            {" · "}
            Mobile: {modeLabel(mobile)}
            {mobile === "sections" ? ` (${sectionList(content, faq)})` : ""}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save chat widget"}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>{status.msg}</span>
        )}
      </div>
    </form>
  );
}

function DeviceMode({
  field,
  value,
  onChange,
}: {
  field: string;
  value: SiteChatDeviceMode;
  onChange: (v: SiteChatDeviceMode) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-gray-200 p-3">
      <legend className="px-1 text-xs font-medium text-gray-500">{field}</legend>
      <div className="space-y-2">
        {MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input
              type="radio"
              className="mt-0.5 accent-blue-600"
              name={`site-chat-${field.toLowerCase()}`}
              checked={value === m.value}
              onChange={() => onChange(m.value)}
            />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-xs text-gray-400">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function modeLabel(mode: SiteChatDeviceMode): string {
  if (mode === "always") return "always";
  if (mode === "off") return "hidden";
  return "selected sections";
}

function sectionList(content: boolean, faq: boolean): string {
  const parts = [];
  if (content) parts.push("content block");
  if (faq) parts.push("FAQ");
  return parts.length ? parts.join(", ") : "none selected";
}
