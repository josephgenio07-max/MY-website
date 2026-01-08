"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ApiOk = {
  accountId: string;
  url: string;
  debug_teamId?: string;
  debug_return_url?: string;
  debug_refresh_url?: string;
};

export default function ConnectStripePage() {
  const router = useRouter();
  const params = useParams();
  const teamId = typeof params?.teamId === "string" ? params.teamId : undefined;

  const [status, setStatus] = useState("Requesting Stripe onboarding link…");
  const [apiText, setApiText] = useState<string>("(waiting)");
  const [apiJson, setApiJson] = useState<any>(null);

  useEffect(() => {
    if (!teamId) {
      setStatus("Missing teamId in the URL.");
      return;
    }

    const run = async () => {
      try {
        setStatus("Calling /api/stripe/connect/create…");

        const res = await fetch("/api/stripe/connect/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        });

        const text = await res.text();
        setApiText(text);

        // Try parse JSON, but don’t assume it is JSON
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        setApiJson(json);

        if (!res.ok) {
          setStatus(`API error (HTTP ${res.status}). See response below.`);
          return;
        }

        if (!json?.url) {
          setStatus("No Stripe onboarding URL returned. See response below.");
          return;
        }

        setStatus("Redirecting to Stripe onboarding…");
        window.location.href = json.url;
      } catch (e: any) {
        setStatus(`Request failed: ${e?.message || String(e)}`);
      }
    };

    run();
  }, [teamId]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900">Connect Stripe</h1>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
          <div className="font-medium">teamId</div>
          <div className="mt-1 break-all">{teamId ?? "undefined"}</div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {status}
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium text-gray-900">API response (raw text)</div>
          <pre className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs overflow-auto">
{apiText}
          </pre>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium text-gray-900">API response (parsed JSON)</div>
          <pre className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs overflow-auto">
{JSON.stringify(apiJson, null, 2)}
          </pre>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
