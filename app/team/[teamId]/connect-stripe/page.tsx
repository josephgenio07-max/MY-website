"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type ApiResult = {
  url?: string;
  accountId?: string;
  error?: string;
  details?: string;
  code?: string;
  type?: string;
};

export default function ConnectStripePage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const supabase = useMemo(() => supabaseBrowser(), []);

  const [status, setStatus] = useState("Preparing Stripe onboarding…");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function run() {
      setError(null);
      setDebug(null);
      setStatus("Checking session…");

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) {
        setError(sessErr.message);
        setStatus("Session error");
        return;
      }
      if (!sessionData.session) {
        router.replace("/auth/login");
        return;
      }

      try {
        setStatus("Requesting Stripe onboarding link…");

        const res = await fetch("/api/stripe/connect/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ teamId }),
        });

        const raw = await res.text();

        let json: ApiResult = {};
        try {
          json = JSON.parse(raw);
        } catch {
          // raw might be HTML or plain text if something crashed hard
        }

        // Always show whatever we got back
        if (!alive) return;
        setDebug({
          status: res.status,
          ok: res.ok,
          json,
          raw: raw?.slice?.(0, 2000), // prevent mega spam
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/auth/login");
            return;
          }

          // 🔥 Key fix: prefer json.details over json.error
          const msg =
            json?.details ||
            json?.error ||
            raw ||
            `Stripe request failed (${res.status})`;

          throw new Error(msg);
        }

        if (!json?.url) {
          throw new Error("Stripe did not return a redirect URL");
        }

        setStatus("Redirecting to Stripe…");
        window.location.assign(json.url);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to connect Stripe");
        setStatus("Connection failed");
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router, teamId, retryKey, supabase]);

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-8 border border-gray-100 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Connect Stripe</h1>

        <p className="mt-2 text-sm text-gray-700">
          You’ll be redirected to Stripe to complete onboarding.
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-800 break-all">
            <span className="font-medium">Team ID:</span> {teamId}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">{status}</p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">Error</p>
            <p className="mt-1 text-sm text-red-700 break-words">{error}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Retry
              </button>

              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        )}

        {debug && (
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-900">Debug response</p>
            <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-800">
              {JSON.stringify(debug, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
