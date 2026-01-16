"use client";

import { useState } from "react";

export default function PaymentButton(props: {
  membershipId: string;
  teamId: string;
  amount: number; // GBP
  defaultName?: string | null;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  stripeReady: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(props.defaultName ?? "");
  const [email, setEmail] = useState(props.defaultEmail ?? "");
  const [phone, setPhone] = useState(props.defaultPhone ?? "");
  const [mode, setMode] = useState<"one_off" | "subscription">("one_off");

  async function pay() {
    setErr(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!props.stripeReady) return setErr("This team is not ready to accept card payments yet.");
    if (!trimmedName || !trimmedEmail) return setErr("Enter your name and email.");
    if (!trimmedPhone) return setErr("Enter your phone number.");

    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "membership",
          membershipId: props.membershipId,
          mode,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
        }),
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Checkout failed");
      if (!json?.url) throw new Error("Checkout did not return a URL");

      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message || "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("one_off")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
            mode === "one_off"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
          }`}
          disabled={busy}
        >
          One-off
        </button>

        <button
          onClick={() => setMode("subscription")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
            mode === "subscription"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
          }`}
          disabled={busy}
        >
          Subscription
        </button>
      </div>

      <div className="space-y-2">
        <input
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          disabled={busy}
        />
        <input
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          disabled={busy}
        />
        <input
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+44..."
          disabled={busy}
        />
        <p className="text-xs text-gray-500">UK number required for reminders.</p>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <button
        onClick={pay}
        disabled={busy || !props.stripeReady}
        className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Pay now"}
      </button>
    </div>
  );
}
