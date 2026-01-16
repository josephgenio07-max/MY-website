"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const PAYMENT_LINK_ROUTE = "/dashboard/new-payment-link";

export default function CreatePaymentLinkCard({
  teamId,
  defaultAmountGBP,
}: {
  teamId: string | null;
  defaultAmountGBP: number; // e.g. plan amount / 100, fallback 5
}) {
  const router = useRouter();

  const [amount, setAmount] = useState<string>(() => String(defaultAmountGBP || 5));

  const disabled = useMemo(() => {
    if (!teamId) return true;
    const n = Number(amount);
    return !Number.isFinite(n) || n <= 0;
  }, [amount, teamId]);

  function go() {
    if (!teamId) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    // Minimal + predictable: send them to a dedicated payment link page.
    // That page should create a link not tied to any player.
    router.push(`${PAYMENT_LINK_ROUTE}?teamId=${encodeURIComponent(teamId)}&amount=${encodeURIComponent(String(n))}`);
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Create payment link</h3>
          <p className="mt-1 text-sm text-gray-600">
            Generate a new link you can send to anyone. Not tied to a player row.
          </p>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
            <span className="text-sm font-semibold text-gray-700 px-2">£</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-full sm:w-28 bg-transparent outline-none text-sm font-semibold text-gray-900"
              placeholder="Amount"
              aria-label="Amount in GBP"
            />
          </div>

          <button
            onClick={go}
            disabled={disabled}
            className="w-full sm:w-auto rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Generate
          </button>
        </div>
      </div>
    </section>
  );
}
