"use client";

import { useMemo, useState } from "react";

type LinkInfo = {
  amountGBP: number | null;
  dueDate: string | null; // YYYY-MM-DD
  billingType: "one_off" | "subscription";
  interval: "week" | "month" | "quarter" | null;
};

type TeamInfo = {
  id: string;
  name: string;
  stripeReady: boolean;
};

type NotFoundProps = { notFound: true };

type FoundProps = {
  notFound?: false;
  token: string;
  team: TeamInfo;
  link: LinkInfo;
};

type Props = NotFoundProps | FoundProps;

function formatDue(d: string | null) {
  if (!d) return null;
  try {
    return new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export default function PayTeamClient(props: Props) {
  if ("notFound" in props && props.notFound) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">Link not found</h1>
          <p className="mt-2 text-sm text-gray-600">This payment link is invalid or disabled.</p>
        </div>
      </main>
    );
  }

  const { token, team, link } = props;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Required explicit consent
  const [consent, setConsent] = useState(false);

  const stripeOk = team.stripeReady;

  const amountText = useMemo(() => {
    if (link.amountGBP == null) return "—";
    return `£${link.amountGBP.toFixed(2)}`;
  }, [link.amountGBP]);

  const dueText = useMemo(() => formatDue(link.dueDate), [link.dueDate]);

  async function startCheckout() {
    setErr(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!link.amountGBP || !Number.isFinite(link.amountGBP) || link.amountGBP <= 0) {
      return setErr("This link is missing a fixed amount. Ask the manager to create a new one.");
    }

    if (!trimmedName) return setErr("Name is required.");
    if (!trimmedEmail) return setErr("Email is required.");
    if (!trimmedPhone) return setErr("Phone number is required.");
    if (!consent) return setErr("You must consent to reminders to continue.");
    if (!stripeOk) return setErr("This team is not ready to accept card payments yet.");

    setBusy(true);
    try {
      // NOTE: no mode, no amountCents. Server must enforce from payment_links.
      const payload = {
        source: "team_payment_link",
        token,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        reminder_consent: consent,
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
          <p className="mt-1 text-sm text-gray-600">Card payment (amount set by the manager).</p>

          {!stripeOk && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This team hasn’t finished payment setup yet.
            </div>
          )}

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Amount: {amountText}</p>
            {dueText && <p className="mt-1 text-xs text-gray-600">Due: {dueText}</p>}
            <p className="mt-2 text-xs text-gray-600">
              This amount is fixed by the manager and can’t be changed here.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email *</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone *</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44..."
              />
              <p className="mt-1 text-xs text-gray-500">UK number required for reminders.</p>
            </div>

            <label className="mt-2 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                I agree to receive payment reminders by SMS/WhatsApp/email for this team.
              </span>
            </label>
          </div>

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
