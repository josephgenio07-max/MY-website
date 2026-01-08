"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

type JoinData = {
  teamId: string;
  teamName: string;
  amount: number;
  currency: string;
  interval: string | null;
  methods_enabled: string[];
  bank_instructions: string | null;
  stripe_ready: boolean;
};

export default function JoinClient({ token }: { token: string }) {
  const [data, setData] = useState<JoinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<null | "one_off" | "subscription">(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | undefined>();
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const joinLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join/${token}`;
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);

      const cleanToken = (token ?? "").trim();
      if (!cleanToken) {
        setError("Missing token. URL must look like /join/<token>.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/join/token?token=${encodeURIComponent(cleanToken)}`,
          { method: "GET", cache: "no-store" }
        );

        const payload = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(payload?.error || "Invalid join link.");
        } else {
          setData(payload);
        }
      } catch {
        if (cancelled) return;
        setError("Failed to load join link.");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canPay = (key: string) => {
    const methods = data?.methods_enabled || [];
    if (key === "card_one_off") {
      return methods.includes("card_one_off") || methods.includes("stripe_one_time");
    }
    if (key === "card_subscription") {
      return methods.includes("card_subscription") || methods.includes("stripe_recurring");
    }
    if (key === "bank") {
      return methods.includes("bank") || methods.includes("bank_transfer");
    }
    return methods.includes(key);
  };

  async function startCheckout(kind: "one_off" | "subscription") {
    setError(null);
    if (!data) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      setError("Please enter your name and email.");
      return;
    }

    if (!phone) {
      setError("Phone number is required for payment reminders.");
      return;
    }

    if (!consent) {
      setError("Please agree to receive payment reminders.");
      return;
    }

    if (!data.stripe_ready) {
      setError("This team isn't ready to take card payments yet.");
      return;
    }

    setPaying(kind);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token,
          name: trimmedName,
          email: trimmedEmail,
          phone,
          method: kind === "subscription" ? "recurring" : "card",
        }),
      });

      // ✅ Always read body (even on 500) so we see the REAL error
      const text = await res.text();
      console.log("checkout status:", res.status);
      console.log("checkout raw response:", text);

      let checkoutJson: any = null;
      try {
        checkoutJson = text ? JSON.parse(text) : null;
      } catch {
        // not JSON
      }

      if (!res.ok) {
        const msg =
          checkoutJson?.message ||
          checkoutJson?.error ||
          text ||
          `Checkout failed with ${res.status}`;
        throw new Error(msg);
      }

      const url = checkoutJson?.url;
      if (!url) throw new Error("Checkout failed: missing redirect URL.");

      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Failed to start checkout.");
      setPaying(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

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

  if (!data) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <p className="text-gray-600">Join link not found.</p>
      </div>
    );
  }

  const price = (data.amount / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Join {data.teamName}</h1>
            <p className="mt-2 text-lg text-gray-600">
              {data.currency.toUpperCase()} {price}
              {data.interval && <span className="text-gray-500"> / {data.interval}</span>}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                placeholder="John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone number <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-gray-900 focus-within:border-transparent">
                <PhoneInput
                  international
                  defaultCountry="GB"
                  value={phone}
                  onChange={setPhone}
                  placeholder="+44 7700 900123"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                We'll send payment reminders via WhatsApp or SMS
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <label className="flex gap-3 items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span className="text-sm text-gray-700">
                  I agree to receive payment reminders by SMS/WhatsApp. Message rates may apply.
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {canPay("card_one_off") && (
              <button
                onClick={() => startCheckout("one_off")}
                disabled={paying !== null}
                className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {paying === "one_off" ? "Redirecting to checkout..." : "Pay by card"}
              </button>
            )}

            {canPay("card_subscription") && (
              <button
                onClick={() => startCheckout("subscription")}
                disabled={paying !== null}
                className="w-full py-3 px-4 border-2 border-gray-900 text-gray-900 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {paying === "subscription" ? "Redirecting to checkout..." : "Set up recurring payment"}
              </button>
            )}

            {(canPay("bank") || canPay("bank_transfer")) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="font-semibold text-gray-900 mb-2">Bank transfer</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {data.bank_instructions ||
                    "Please transfer the amount and include your name + team name as reference."}
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                if (joinLink) window.open(joinLink, "_blank", "noopener,noreferrer");
              }}
              className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Open join page in new tab
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}
