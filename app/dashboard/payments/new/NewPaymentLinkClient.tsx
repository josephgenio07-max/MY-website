"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Interval = "week" | "month" | "quarter";
type BillingType = "one_off" | "subscription";

export default function NewPaymentLinkClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const teamId = (sp.get("teamId") || "").trim();
  const defaultAmount = Number(sp.get("amount") || "20");

  const [amountGBP, setAmountGBP] = useState<number>(Number.isFinite(defaultAmount) ? defaultAmount : 20);
  const [interval, setInterval] = useState<Interval>("month");
  const [billingType, setBillingType] = useState<BillingType>("one_off");
  const [dueDate, setDueDate] = useState<string>(""); // YYYY-MM-DD

  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const base = useMemo(
    () => process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  if (!teamId) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Missing teamId. Go back to dashboard and open this page from the button.
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm border border-gray-100 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Create payment link</h1>
          <p className="mt-1 text-sm text-gray-600">Generate a link to share with a player.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount (£)</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
              value={amountGBP}
              onChange={(e) => setAmountGBP(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Frequency</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
              value={interval}
              onChange={(e) => setInterval(e.target.value as Interval)}
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Billing type</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as BillingType)}
            >
              <option value="one_off">One-off</option>
              <option value="subscription">Recurring</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Due date (optional)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isPending}
            onClick={() => {
              setErr(null);
              setLink(null);

              const cents = Math.round((Number(amountGBP) || 0) * 100);
              if (!Number.isFinite(cents) || cents <= 0) {
                setErr("Invalid amount.");
                return;
              }

              const dueAt = dueDate ? new Date(`${dueDate}T00:00:00Z`).toISOString() : null;

              startTransition(async () => {
                try {
                  const res = await fetch("/api/payment-links/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      teamId,
                      amountCents: cents,
                      billingType,
                      interval,
                      dueAt,
                    }),
                  });

                  const json = await res.json();
                  if (!res.ok) throw new Error(json?.error || "Failed to create link");

                  const url = `${base}/pay/${json.token}`;
                  setLink(url);
                  await navigator.clipboard.writeText(url);
                } catch (e: any) {
                  setErr(e?.message ?? "Failed to create link");
                }
              });
            }}
          >
            {isPending ? "Creating…" : "Generate link"}
          </button>

          <button
            type="button"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
            onClick={() => router.push("/dashboard")}
          >
            Back
          </button>
        </div>

        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        {link && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
            <p className="font-medium text-green-900">Link created (copied)</p>
            <p className="mt-2 break-all text-sm text-green-900">{link}</p>
          </div>
        )}
      </div>
    </main>
  );
}
