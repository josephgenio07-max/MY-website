"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { markPaidAction } from "./actions";

export default function MarkPaidButton(props: {
  teamId: string;
  playerId: string;
  defaultAmountCents: number;
  currency: string; // "gbp"
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<number>(
    Math.round((props.defaultAmountCents || 0) / 100)
  );
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keep amount in sync if default changes
  useEffect(() => {
    setAmount(Math.round((props.defaultAmountCents || 0) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.defaultAmountCents]);

  const disabledReason = useMemo(() => {
    if (!props.teamId) return "Missing team id";
    if (!props.playerId) return "Missing player id";
    return null;
  }, [props.teamId, props.playerId]);

  const hardDisabled = Boolean(disabledReason);

  function onSubmit() {
    setErr(null);
    setOk(null);

    if (hardDisabled) {
      setErr(disabledReason || "Missing required IDs.");
      return;
    }

    const cents = Math.round((Number(amount) || 0) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr("Invalid amount");
      return;
    }

    startTransition(async () => {
      try {
        await markPaidAction({
          teamId: props.teamId,
          playerId: props.playerId,
          amount: cents,
          currency: props.currency,
          note: note.trim() ? note.trim() : undefined,
        });

        setOk("Saved");
        setNote("");

        // Optional: clear success message after a moment
        setTimeout(() => setOk(null), 1500);
      } catch (e: any) {
        setErr(e?.message ?? "Failed");
      }
    });
  }

  return (
    <div className="w-full">
      {/* Mobile: stacked inputs + full-width button. Desktop: inline. */}
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2">
        <div className="col-span-1">
          <input
            type="number"
            min={1}
            inputMode="decimal"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 sm:w-24"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            disabled={isPending || hardDisabled}
            aria-label="Amount in pounds"
          />
        </div>

        <div className="col-span-1">
          <input
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 sm:w-40"
            placeholder="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending || hardDisabled}
            aria-label="Note"
          />
        </div>

        <button
          className="col-span-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 sm:col-auto sm:px-3 sm:py-2"
          disabled={isPending || hardDisabled}
          onClick={onSubmit}
        >
          {isPending ? "Saving…" : "Mark paid"}
        </button>
      </div>

      {/* Feedback */}
      <div className="mt-1 min-h-[16px]">
        {ok && <div className="text-[11px] text-emerald-700">{ok}</div>}
        {!ok && err && <div className="text-[11px] text-rose-600">{err}</div>}
        {!ok && !err && disabledReason && (
          <div className="text-[11px] text-gray-500">{disabledReason}</div>
        )}
      </div>
    </div>
  );
}
