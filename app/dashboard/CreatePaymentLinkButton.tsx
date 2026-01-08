"use client";

import { useRouter } from "next/navigation";

export default function CreatePaymentLinkButton(props: { teamId: string; defaultAmountCents: number }) {
  const router = useRouter();
  const amount = Math.round(props.defaultAmountCents / 100);

  return (
    <button
      type="button"
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      onClick={() => router.push(`/dashboard/payments/new?teamId=${props.teamId}&amount=${amount}`)}
    >
      Create payment link
    </button>
  );
}
