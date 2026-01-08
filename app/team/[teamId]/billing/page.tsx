"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type StripeStatus = {
  teamId: string;
  teamName?: string;
  stripe_account_id: string | null;
  connected: boolean;
  charges_enabled?: boolean;
  card_payments?: string;
  transfers?: string;
  requirements?: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
  };
  error?: string;
  details?: string;
};

export default function BillingPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StripeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusUrl = useMemo(() => {
    if (!teamId) return null;
    return `/api/stripe/connect/status?teamId=${encodeURIComponent(teamId)}`;
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!statusUrl) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(statusUrl, { method: "GET" });
        const json = (await res.json()) as StripeStatus;

        if (!res.ok) {
          throw new Error(json.error || "Failed to load billing status");
        }

        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [statusUrl]);

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1>Billing</h1>

      <div style={{ marginTop: 8 }}>
        <div>
          <strong>teamId (from URL):</strong>{" "}
          <code style={{ color: teamId ? "inherit" : "crimson" }}>{String(teamId)}</code>
        </div>
      </div>

      {loading && <div style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}

      {!loading && data && (
        <>
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd" }}>
            <div><strong>team:</strong> {data.teamName ?? "(unknown)"}</div>
            <div><strong>connected account:</strong> {data.stripe_account_id ?? "(none)"}</div>
            <div><strong>connected:</strong> {String(data.connected)}</div>
            <div><strong>charges_enabled:</strong> {String(data.charges_enabled)}</div>
            <div><strong>card_payments:</strong> {String(data.card_payments)}</div>
            <div><strong>transfers:</strong> {String(data.transfers)}</div>
          </div>

          <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", background: "#f9fafb" }}>
            <h2 style={{ marginTop: 0 }}>Stripe Requirements (why it’s inactive)</h2>
            <p>
              Card payments won’t become <strong>active</strong> until{" "}
              <strong>requirements.currently_due</strong> is empty.
            </p>

            <div style={{ marginTop: 12 }}>
              <strong>currently_due</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(data.requirements?.currently_due ?? [], null, 2)}
              </pre>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>past_due</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(data.requirements?.past_due ?? [], null, 2)}
              </pre>
            </div>

            <div style={{ marginTop: 12 }}>
              <strong>eventually_due</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(data.requirements?.eventually_due ?? [], null, 2)}
              </pre>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 14px" }}
            >
              Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
}
