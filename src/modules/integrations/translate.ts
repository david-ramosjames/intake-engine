// One-shot translation via OpenAI. Given {key: englishText} entries, returns
// {key: translatedText}. Used by the journey editor's "Translate to Spanish"
// button — the result is written into definition.i18n.es for human review, not
// applied live. Requires OPENAI_API_KEY; model overridable via OPENAI_MODEL.

export interface TranslateItem {
  key: string;
  text: string;
}

const LANGUAGE_NAMES: Record<string, string> = { es: "Spanish", en: "English" };

// Translate in chunks so a large journey stays within a comfortable request size
// and the model reliably returns well-formed JSON.
const CHUNK_SIZE = 40;

export async function translateItems(
  items: TranslateItem[],
  targetLocale: string,
  context = "a personal-injury law firm's marketing landing page",
): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const targetName = LANGUAGE_NAMES[targetLocale] ?? targetLocale;

  const result: Record<string, string> = {};
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const input: Record<string, string> = {};
    for (const it of chunk) input[it.key] = it.text;
    Object.assign(result, await translateChunk(input, targetName, context, model, apiKey));
  }
  return result;
}

async function translateChunk(
  input: Record<string, string>,
  targetName: string,
  context: string,
  model: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const system =
    `You are a professional translator localizing ${context} into ${targetName} ` +
    `for a US Hispanic audience. Translate the VALUES of the JSON object from English to ${targetName}. ` +
    `Keep the tone warm, trustworthy and natural — localize, don't translate word-for-word. ` +
    `Preserve each value's line breaks (\\n), capitalization style, punctuation, emoji, and any {{placeholders}} exactly. ` +
    `Do not translate the keys. Return ONLY a JSON object with the same keys and translated values — no extra keys, no commentary.`;

  const base = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const hint = res.status === 401 ? " (check OPENAI_API_KEY)" : "";
    throw new Error(`OpenAI returned ${res.status}${hint}. ${body}`.trim());
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }
  // Only keep keys we asked for, with string values.
  const out: Record<string, string> = {};
  if (parsed && typeof parsed === "object") {
    for (const key of Object.keys(input)) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim() !== "") out[key] = v;
    }
  }
  return out;
}
