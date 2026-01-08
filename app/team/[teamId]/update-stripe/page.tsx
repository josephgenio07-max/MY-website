"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ApiResponse = {
  accountId?: string;
  url?: string;
  error?: string;
  details?: string;
  debug_teamId?: string;
  debug_return_url?: string;
  debug_refresh_url?: string;
};

export default function ConnectStripePage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;

  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "redirecting">("loading");

  useEffect(() => {
    if (!teamId) return;

    fetch("/api/stripe/connect/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse;
        setResponse(json);

        if (!res.ok || !json.url) {
          setStatus("error");
          return;
        }

        setStatus("redirecting");
        window.location.href = json.url;
      })
      .catch((err) => {
        setStatus("error");
        setResponse({ error: "Network error", details: String(err) });
      });
  }, [teamId]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Connect Stripe (Onboarding)</h1>

      <p>
        <strong>teamId (from URL):</strong>{" "}
        <code style={{ color: teamId ? "inherit" : "crimson" }}>{String(teamId)}</code>
      </p>

      {status === "loading" && <p>Requesting Stripe onboarding link…</p>}

      {status === "redirecting" && (
        <p>
          Redirecting you to Stripe onboarding… If it doesn’t redirect, copy the <code>url</code> below
          and open it in a new tab.
        </p>
      )}

      {status === "error" && (
        <div style={{ padding: 12, border: "1px solid #fca5a5", background: "#fef2f2" }}>
          <strong>Could not get Stripe onboarding URL.</strong>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>API response</strong>
        <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ddd", background: "#f9fafb" }}>
          {JSON.stringify(response, null, 2)}
        </pre>
      </div>

      <p style={{ marginTop: 16 }}>
        After you finish Stripe onboarding and it redirects you back, go here:
      </p>

      <pre style={{ padding: 12, border: "1px solid #ddd", background: "#f9fafb" }}>
        http://localhost:3000/team/{String(teamId)}/billing
      </pre>
    </div>
  );
}
