"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

type PayData = {
  teamId: string;
  teamName: string;
  amount: number;
  currency: string;
  interval: string; // week/month/quarter
  billing_type: "one_off" | "subscription";
  stripe_ready: boolean;
};

export default function PayClient({ token }: { token: string }) {
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>();
  const [consent, setConsent] = useState(false);

  const payLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/pay/${token}`;
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);

      const cleanToken = (token ?? "").trim();
      if (!cleanToken) {
        setError("Missing token. URL must look like /pay/<token>.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/pay/token?token=${encodeURIComponent(cleanToken)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await res.json();
        if (cancelled) return;

        if (!res.ok) setError(payload?.error || "Invalid payment link.");
        else setData(payload);
      } catch {
        if (!cancelled) setError("Failed to load payment link.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function startCheckout() {
    setError(null);
    if (!data) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) return setError("Please enter your name and email.");
    if (!phone) return setError("Phone number is required for payment reminders.");
    if (!consent) return setError("Please agree to receive payment reminders.");
    if (!data.stripe_ready) return setError("This team isn't ready to take card payments yet.");

    setPaying(true);

    try {
      // IMPORTANT:
      // This assumes you update /api/stripe/checkout to ALSO accept payment_links tokens,
      // OR create a new endpoint /api/stripe/pay-checkout.
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token, // pay token
          name: trimmedName,
          email: trimmedEmail,
          phone,
          method: data.billing_type === "subscription" ? "recurring" : "card",
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) throw new Error(json?.error || json?.message || text || `Checkout failed (${res.status})`);

      const url = json?.url;
      if (!url) throw new Error("Checkout failed: missing redirect URL.");

      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Failed to start checkout.");
      setPaying(false);
    }
  }

  if (loading) return <div className="p-6 max-w-lg mx-auto">Loading…</div>;

  if (error && !data) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-6 max-w-lg mx-auto">Link not found.</div>;

  const price = (data.amount / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Pay {data.teamName}</h1>
            <p className="mt-2 text-lg text-gray-600">
              {data.currency.toUpperCase()} {price} <span className="text-gray-500">/ {data.interval}</span>
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
              <input
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number *</label>
              <div className="border border-gray-300 rounded-lg p-2">
                <PhoneInput international defaultCountry="GB" value={phone} onChange={setPhone} />
              </div>
            </div>

            <label className="flex gap-3 items-start cursor-pointer bg-gray-50 rounded-lg p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm text-gray-700">
                I agree to receive payment reminders by SMS/WhatsApp. Message rates may apply.
              </span>
            </label>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <button
            onClick={startCheckout}
            disabled={paying}
            className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {paying ? "Redirecting…" : data.billing_type === "subscription" ? "Set up recurring payment" : "Pay now"}
          </button>

          <button
            type="button"
            onClick={() => payLink && window.open(payLink, "_blank", "noopener,noreferrer")}
            className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
          >
            Open pay page in new tab
          </button>
        </div>
      </div>
    </div>
  );
}
