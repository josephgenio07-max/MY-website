"use client";

import { useState } from "react";
import supabase from "@/lib/supabase";

export default function SetCustomAmountButton({
  membershipId,
  currentAmount,
  teamDefaultAmount,
}: {
  membershipId: string;
  currentAmount: number | null;
  teamDefaultAmount: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(
    currentAmount !== null ? String(currentAmount) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);

    try {
      const value =
        amount.trim() === "" ? null : Math.max(0, Number(amount));

      if (value !== null && isNaN(value)) {
        throw new Error("Invalid amount");
      }

      const { error } = await supabase
        .from("memberships")
        .update({ custom_amount_gbp: value })
        .eq("id", membershipId);

      if (error) throw error;

      setOpen(false);
      window.location.reload(); // simple + reliable
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Custom £
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Custom payment amount
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Leave empty to use team default (£{teamDefaultAmount})
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (£)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
