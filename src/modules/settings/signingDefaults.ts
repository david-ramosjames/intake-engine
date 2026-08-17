// Business-level default e-signature contracts (DocuSeal template IDs), one for
// English and one for Spanish. Any journey's sign step that leaves its own
// template IDs blank inherits these, so swapping contracts is a one-place change
// instead of editing every sign step. Stored in the org settings blob.

export interface SigningDefaults {
  templateIdEn: string;
  templateIdEs: string;
}

export function readSigningDefaults(settings: Record<string, unknown> | undefined): SigningDefaults {
  const s = settings?.signing;
  const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { templateIdEn: str(o.templateIdEn), templateIdEs: str(o.templateIdEs) };
}
