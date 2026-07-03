// Authentication (Auth.js / NextAuth v5).
//
// Google OAuth, restricted to a single email domain (Ramos James). The `hd`
// parameter only *hints* Google's account chooser — it is NOT a security
// boundary — so the authoritative check is in the `signIn` callback against the
// verified email domain (and Google's `hd` claim when present).
//
// Sessions are JWT (no database adapter needed), so auth works in edge
// middleware and every server component without extra infrastructure. Linking a
// user to Organizations/Memberships is a later step; for now, any allowed-domain
// account may access the admin.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// The only email domain permitted to sign in. Configurable, defaults to the
// first customer.
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "ramosjames.com";

// Auth is enforced only when Google credentials are configured. This keeps
// local DEMO development usable without setting up OAuth, while production
// (where the credentials are set) requires sign-in.
export const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID);

interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Railway (and most hosts) sit behind a proxy; trust the forwarded host.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      // Support either Auth.js's conventional names or the plain Google names.
      clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { hd: ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  callbacks: {
    // Authoritative gate: only verified emails on the allowed domain.
    signIn({ profile }) {
      const p = profile as GoogleProfile | undefined;
      const email = p?.email?.toLowerCase();
      if (!email || p?.email_verified === false) return false;
      const domain = email.split("@")[1];
      if (domain !== ALLOWED_EMAIL_DOMAIN) return false;
      // If Google supplies a hosted-domain claim, it must also match.
      if (p?.hd && p.hd !== ALLOWED_EMAIL_DOMAIN) return false;
      return true;
    },
  },
});
