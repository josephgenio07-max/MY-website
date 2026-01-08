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
  const [amount, setAmount] = useState<number>(Math.round((props.defaultAmountCents || 0) / 100));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keep amount in sync if default changes (prevents weird stale UI)
  useEffect(() => {
    setAmount(Math.round((props.defaultAmountCents || 0) / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.defaultAmountCents]);

  const hardDisabled = useMemo(() => {
    if (!props.teamId) return true;
    if (!props.playerId) return true;
    return false;
  }, [props.teamId, props.playerId]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          className="border rounded px-2 py-1 text-xs w-20"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={isPending || hardDisabled}
        />

        <input
          className="border rounded px-2 py-1 text-xs w-28"
          placeholder="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending || hardDisabled}
        />

        <button
          className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          disabled={isPending || hardDisabled}
          onClick={() => {
            setErr(null);
            setOk(null);

            if (!props.teamId || !props.playerId) {
              setErr("Missing team/player id.");
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
              } catch (e: any) {
                setErr(e?.message ?? "Failed");
              }
            });
          }}
        >
          {isPending ? "Saving…" : "Mark paid"}
        </button>
      </div>

      {ok && <div className="text-[11px] text-green-700">{ok}</div>}
      {err && <div className="text-[11px] text-red-600">{err}</div>}
    </div>
  );
}
