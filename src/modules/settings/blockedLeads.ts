// Org-level block list for spam contacts. If a visitor's name, phone, or email
// matches an entry, we do not create a lead, Slack, CallRail, ads conversion,
// or Sign Flow contract. Stored in the org settings blob.

export interface BlockedLeads {
  names: string[];
  phones: string[];
  emails: string[];
}

export interface BlockedContact {
  displayName?: string;
  email?: string;
  phone?: string;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readBlockedLeads(settings: Record<string, unknown> | undefined): BlockedLeads {
  const raw = settings?.blockedLeads;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    names: asStringList(o.names),
    phones: asStringList(o.phones),
    emails: asStringList(o.emails),
  };
}

export function parseBlockedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function blockedLeadsToLines(list: BlockedLeads): { names: string; phones: string; emails: string } {
  return {
    names: list.names.join("\n"),
    phones: list.phones.join("\n"),
    emails: list.emails.join("\n"),
  };
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Digits only, so (512) 555-1234 and +1-512-555-1234 compare the same. */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function phonesMatch(entered: string, blocked: string): boolean {
  const a = normalizePhoneDigits(entered);
  const b = normalizePhoneDigits(blocked);
  if (!a || !b) return false;
  if (a === b) return true;
  // US numbers: compare the last 10 digits so +1 / leading 1 still match.
  if (a.length >= 10 && b.length >= 10) return a.slice(-10) === b.slice(-10);
  return false;
}

export function contactIsBlocked(list: BlockedLeads, contact: BlockedContact): boolean {
  const name = contact.displayName ? normalizeName(contact.displayName) : "";
  if (name && list.names.some((n) => normalizeName(n) === name)) return true;

  const email = contact.email ? normalizeEmail(contact.email) : "";
  if (email && list.emails.some((e) => normalizeEmail(e) === email)) return true;

  const phone = contact.phone?.trim() ?? "";
  if (phone && list.phones.some((p) => phonesMatch(phone, p))) return true;

  return false;
}

export function blockedLeadsCount(list: BlockedLeads): number {
  return list.names.length + list.phones.length + list.emails.length;
}
