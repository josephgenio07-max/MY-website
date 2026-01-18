"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function getOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

// IMPORTANT: this must match your route file:
// app/api/payment-links/create/route.ts  ->  /api/payment-links/create
const CREATE_LINK_API = "/api/payment-links/create";

export default function NewPaymentLinkClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const teamId = (sp.get("teamId") || "").trim();
  const returnTo = (sp.get("returnTo") || "/dashboard").trim();

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!token) return null;
    return `${getOrigin()}/pay/team/${token}`;
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);
      setToken(null);

      if (!teamId) {
        setLoading(false);
        setErr("Missing teamId.");
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(CREATE_LINK_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
          cache: "no-store",
          credentials: "include",
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }

        if (!res.ok) {
          throw new Error(json?.error || text || "API request failed");
        }

        const tok = json?.token;
        if (!tok) throw new Error("No token returned");

        if (!cancelled) {
          setToken(String(tok));
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to create link");
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Payment link</h1>
              <p className="mt-1 text-sm text-gray-600">
                Generate a shareable link. Players can choose one-off or subscription.
              </p>
            </div>

            <button
              onClick={() => router.push(returnTo)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back
            </button>
          </div>

          {loading && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              Creating link…
            </div>
          )}

          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {err}
            </div>
          )}

          {!loading && !err && shareUrl && (
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Share this link</p>
                <p className="mt-1 break-all text-sm font-semibold text-gray-900">
                  {shareUrl}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={copy}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Copy link
                </button>

                <button
                  onClick={() => router.push(`/pay/team/${token}`)}
                  className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Open page
                </button>
              </div>

              <p className="text-xs text-gray-500">
                This link is not tied to a specific player row.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
