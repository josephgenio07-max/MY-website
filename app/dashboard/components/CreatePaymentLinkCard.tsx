"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

const PAYMENT_LINK_ROUTE = "/dashboard/new-payment-link";

export default function CreatePaymentLinkCard({
  teamId,
}: {
  teamId: string | null;
}) {
  const router = useRouter();

  const disabled = useMemo(() => !teamId, [teamId]);

  function go() {
    if (!teamId) return;
    router.push(
      `${PAYMENT_LINK_ROUTE}?teamId=${encodeURIComponent(teamId)}&returnTo=${encodeURIComponent("/dashboard")}`
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Create payment link</h3>
          <p className="mt-1 text-sm text-gray-600">
            Generate a shareable link for one-off payments or subscriptions. Not tied to any player.
          </p>
        </div>

        <button
          onClick={go}
          disabled={disabled}
          className="w-full sm:w-auto rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Generate
        </button>
      </div>
    </section>
  );
}
