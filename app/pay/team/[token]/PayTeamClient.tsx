"use client";

import { useMemo, useState } from "react";

type LinkInfo = {
  allowOneOff: boolean;
  allowSubscription: boolean;
  allowCustomAmount: boolean;
  defaultAmountGBP: number | null;
  minAmountGBP: number;
  maxAmountGBP: number;
};

type TeamInfo = {
  id: string;
  name: string;
  stripeReady: boolean;
};

type PlanInfo = { amountCents: number; currency: string; interval: string } | null;

type NotFoundProps = {
  notFound: true;
};

type FoundProps = {
  notFound?: false;
  token: string;
  team: TeamInfo;
  link: LinkInfo;
  plan: PlanInfo;
};

type Props = NotFoundProps | FoundProps;

export default function PayTeamClient(props: Props) {
  // ✅ TS-safe: if notFound, return early
  if ("notFound" in props && props.notFound) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">Link not found</h1>
          <p className="mt-2 text-sm text-gray-600">
            This payment link is invalid or disabled.
          </p>
        </div>
      </main>
    );
  }

  const { token, team, link, plan } = props;

  const [mode, setMode] = useState<"one_off" | "subscription">("one_off");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Simple inputs (you can later make name/email/phone fields here if needed)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const defaultOneOff = useMemo(() => {
    if (link.defaultAmountGBP != null) return link.defaultAmountGBP;
    if (plan?.amountCents) return plan.amountCents / 100;
    return 10;
  }, [link.defaultAmountGBP, plan]);

  const [amountGBP, setAmountGBP] = useState<number>(defaultOneOff);

  const canSub = link.allowSubscription && !!plan;
  const stripeOk = team.stripeReady;

  async function startCheckout() {
    setErr(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail) {
      return setErr("Please enter your name and email.");
    }
    if (!trimmedPhone) {
      return setErr("Please enter your phone number.");
    }

    if (!stripeOk) return setErr("This team is not ready to accept card payments yet.");

    if (mode === "subscription" && !canSub) {
      return setErr("Subscription isn’t available for this team.");
    }

    if (mode === "one_off") {
      if (!link.allowOneOff) return setErr("One-off payments are disabled.");
      if (!Number.isFinite(amountGBP) || amountGBP < link.minAmountGBP || amountGBP > link.maxAmountGBP) {
        return setErr(`Enter an amount between £${link.minAmountGBP} and £${link.maxAmountGBP}.`);
      }
    }

    setBusy(true);
    try {
      const payload =
        mode === "one_off"
          ? {
              source: "team_payment_link",
              token,
              mode: "one_off",
              amountCents: Math.round(amountGBP * 100),
              name: trimmedName,
              email: trimmedEmail,
              phone: trimmedPhone,
            }
          : {
              source: "team_payment_link",
              token,
              mode: "subscription",
              name: trimmedName,
              email: trimmedEmail,
              phone: trimmedPhone,
            };

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <p className="mt-1 text-sm text-gray-600">Pay securely via card.</p>

          {!stripeOk && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This team hasn’t finished payment setup yet.
            </div>
          )}

          {/* Details */}
          <div className="mt-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44..."
              />
              <p className="mt-1 text-xs text-gray-500">UK number required for reminders.</p>
            </div>
          </div>

          {/* Mode */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("one_off")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
                mode === "one_off"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
              }`}
            >
              One-off
            </button>

            <button
              onClick={() => setMode("subscription")}
              disabled={!canSub}
              className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
                mode === "subscription"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
              } ${!canSub ? "opacity-50 cursor-not-allowed" : ""}`}
              title={!plan ? "Team has no subscription plan set" : ""}
            >
              Subscription
            </button>
          </div>

          {/* Amount / Plan */}
          {mode === "one_off" ? (
            <div className="mt-5 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number"
                min={link.minAmountGBP}
                max={link.maxAmountGBP}
                step={0.5}
                value={amountGBP}
                onChange={(e) => setAmountGBP(Number(e.target.value))}
                disabled={!link.allowCustomAmount}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
              />
              <p className="text-xs text-gray-500">
                Min £{link.minAmountGBP} · Max £{link.maxAmountGBP}
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">
                £{((plan?.amountCents || 0) / 100).toFixed(2)} / {plan?.interval}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Recurring payment (fixed by the team).
              </p>
            </div>
          )}

          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <button
            onClick={startCheckout}
            disabled={busy || !stripeOk}
            className="mt-5 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Redirecting…" : "Pay now"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-500">Powered by Stripe · Card payments only</p>
      </div>
    </main>
  );
}
