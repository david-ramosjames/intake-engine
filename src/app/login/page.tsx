import { redirect } from "next/navigation";
import { ALLOWED_EMAIL_DOMAIN, auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="admin-light flex min-h-dvh items-center justify-center bg-gray-50 px-6 text-gray-900">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            IE
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Intake Engine</span>
        </div>

        <h1 className="mt-6 text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          Use your <span className="font-medium text-gray-700">@{ALLOWED_EMAIL_DOMAIN}</span> Google
          account.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error === "AccessDenied"
              ? `Only @${ALLOWED_EMAIL_DOMAIN} accounts can sign in.`
              : "Sign-in failed. Please try again."}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/admin" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <GoogleG />
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
