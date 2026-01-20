"use client";

import { useRouter } from "next/navigation";

export default function CreatePaymentLinkButton(props: { teamId: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      onClick={() =>
        router.push(
          `/dashboard/new-payment-link?teamId=${encodeURIComponent(props.teamId)}&returnTo=${encodeURIComponent(
            "/dashboard"
          )}`
        )
      }
    >
      Create payment link
    </button>
  );
}
