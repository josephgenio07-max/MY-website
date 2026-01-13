"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type ApiResult = { url: string; accountId?: string };

export default function ConnectStripePage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [status, setStatus] = useState<string>("Preparing Stripe onboarding…");
  const [debug, setDebug] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setError(null);
      setDebug(null);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      try {
        setStatus("Requesting Stripe onboarding link…");

        const res = await fetch("/api/stripe/connect/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            managerId: data.user.id, // temporary auth guard; backend checks ownership
          }),
          cache: "no-store",
        });

        const text = await res.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          // ignore
        }

        if (!res.ok) {
          throw new Error(json?.error || text || "Failed to start onboarding");
        }

        const parsed = json as ApiResult;
        setDebug(parsed);

        if (!alive) return;

        if (parsed.url) {
          setStatus("Redirecting to Stripe onboarding…");
          window.location.href = parsed.url;
          return;
        }

        throw new Error("No URL returned from API");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to connect Stripe");
        setStatus("Failed");
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [router, teamId]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900">Connect Stripe</h1>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            <span className="font-medium">teamId:</span> {teamId}
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">{status}</p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {debug && (
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-900">API response (debug)</p>
            <pre className="mt-2 overflow-auto rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-800">
              {JSON.stringify(debug, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
