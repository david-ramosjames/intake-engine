// Outbound mail. Prefers a Google Workspace service account (Gmail API +
// domain-wide delegation), then Resend. Used by lead automations and the
// weekly performance email.

import { createSign } from "crypto";

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return "";
}

function parseServiceAccountJson(): { email: string; key: string } | null {
  const raw = firstEnv("GMAIL_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (o.client_email && o.private_key) return { email: o.client_email, key: o.private_key };
  } catch {
    /* not JSON */
  }
  return null;
}

function serviceAccount(): { email: string; key: string } | null {
  const fromJson = parseServiceAccountJson();
  const email = env("GMAIL_SERVICE_ACCOUNT_EMAIL") || fromJson?.email || "";
  const keyRaw =
    firstEnv("GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY", "GMAIL_PRIVATE_KEY") || fromJson?.key || "";
  const key = keyRaw.replace(/\\n/g, "\n").trim();
  if (!email || !key) return null;
  return { email, key };
}

/** The Workspace user the service account impersonates (must match Gmail send-as). */
export function mailFromAddress(): string {
  const raw = firstEnv("GMAIL_SEND_AS", "GMAIL_IMPERSONATE_EMAIL", "AUTOMATION_EMAIL_FROM");
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim();
}

export function mailFromHeader(): string {
  return firstEnv("GMAIL_SEND_AS", "GMAIL_IMPERSONATE_EMAIL", "AUTOMATION_EMAIL_FROM") || mailFromAddress();
}

export function gmailConfigured(): boolean {
  return Boolean(serviceAccount() && mailFromAddress());
}

export function resendConfigured(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("AUTOMATION_EMAIL_FROM"));
}

export function emailDeliveryConfigured(): boolean {
  return gmailConfigured() || resendConfigured();
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function gmailAccessToken(sa: { email: string; key: string }, sub: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.email,
      sub,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${b64url(sign.sign(sa.key))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token ${res.status}`);
  }
  return data.access_token;
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}

function rfc822(input: SendEmailInput): string {
  const from = mailFromHeader();
  const to = input.to.join(", ");
  const boundary = `ie_${Date.now().toString(36)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (input.html) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  return [
    ...headers,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.text,
  ].join("\r\n");
}

async function sendViaGmail(input: SendEmailInput): Promise<void> {
  const sa = serviceAccount();
  const sub = mailFromAddress();
  if (!sa || !sub) throw new Error("Gmail service account isn’t fully configured.");
  const token = await gmailAccessToken(sa, sub);
  const raw = b64url(rfc822(input));
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error(`Gmail ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  const key = env("RESEND_API_KEY");
  const from = env("AUTOMATION_EMAIL_FROM");
  if (!key || !from) throw new Error("Resend isn’t configured.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html ?? input.text.replace(/\n/g, "<br>"),
      text: input.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const to = input.to.map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new Error("Add at least one recipient.");
  const payload = { ...input, to };
  if (gmailConfigured()) {
    await sendViaGmail(payload);
    return;
  }
  if (resendConfigured()) {
    await sendViaResend(payload);
    return;
  }
  throw new Error(
    "Email isn’t configured. Set GMAIL_SERVICE_ACCOUNT_EMAIL, GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY, and GMAIL_SEND_AS (or AUTOMATION_EMAIL_FROM).",
  );
}
