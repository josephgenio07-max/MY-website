"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BillingType = "one_off" | "subscription";
type Interval = "week" | "month" | "quarter";

function isValidDateYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isPastDate(dueYYYYMMDD: string) {
  // Compare as local date (good enough for your UI)
  const [y, m, d] = dueYYYYMMDD.split("-").map(Number);
  const due = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export default function NewPaymentLinkClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const teamId = (sp.get("teamId") || "").trim();
  const returnTo = (sp.get("returnTo") || "/dashboard").trim();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // REQUIRED fields (per your request)
  const [amountGBP, setAmountGBP] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [billingType, setBillingType] = useState<BillingType>("one_off");
  const [interval, setInterval] = useState<Interval>("month");

  const disabled = useMemo(() => !teamId || busy, [teamId, busy]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Failed to copy");
    }
  }

  async function generate() {
    setErr(null);
    setUrl(null);

    if (!teamId) {
      setErr("Missing teamId. Go back and pick a team.");
      return;
    }

    const amtTrim = amountGBP.trim();
    const dueTrim = dueDate.trim();

    // FORCE input
    if (!amtTrim) {
      setErr("Please enter an amount.");
      return;
    }
    if (!dueTrim) {
      setErr("Please select a due date.");
      return;
    }

    // Validate amount
    const n = Number(amtTrim);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Enter a valid amount (e.g. 15 or 12.50).");
      return;
    }
    const amountNum = Number(n.toFixed(2));
    if (amountNum < 1 || amountNum > 200) {
      setErr("Amount must be between £1 and £200.");
      return;
    }

    // Validate due date
    if (!isValidDateYYYYMMDD(dueTrim)) {
      setErr("Due date must be a valid date.");
      return;
    }
    if (isPastDate(dueTrim)) {
      setErr("Due date can’t be in the past.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/payment-links/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          teamId,
          amount_gbp: amountNum, // REQUIRED now
          due_date: dueTrim,     // REQUIRED now
          billing_type: billingType,
          interval: billingType === "subscription" ? interval : null,
        }),
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Failed to create link");
      if (!json?.url) throw new Error("API did not return a URL");

      setUrl(String(json.url));
    } catch (e: any) {
      setErr(e?.message || "Failed to create link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">New payment link</h1>
              <p className="mt-1 text-sm text-gray-600">
                Set an amount + due date for a mid-season joiner. This becomes their membership amount.
              </p>
            </div>

            <button
              onClick={() => router.push(returnTo)}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as BillingType)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="one_off">One-off</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>

            {billingType === "subscription" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interval</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as Interval)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£)</label>
              <input
                type="number"
                min={1}
                max={200}
                step={0.5}
                value={amountGBP}
                onChange={(e) => setAmountGBP(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. 15"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {err && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            {url && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold text-gray-600 uppercase">Generated link</p>
                <code className="mt-2 block break-all text-sm text-gray-800">{url}</code>

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => copy(url)}
                    className="w-full sm:w-auto rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    Copy
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 text-center"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}

            <button
              onClick={generate}
              disabled={disabled}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate link"}
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-gray-500">
          After the player pays, they’ll appear on the dashboard and be charged this amount going forward.
        </div>
      </div>
    </main>
  );
}
