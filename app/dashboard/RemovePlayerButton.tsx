"use client";

import { useState, useTransition } from "react";
import { removePlayerAction } from "./actions";

export default function RemovePlayerButton(props: { teamId: string; playerId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      disabled={isPending}
      onClick={() => {
        setErr(null);
        const ok = confirm("Remove this player? This stops reminders and due tracking (history is kept).");
        if (!ok) return;

        startTransition(async () => {
          try {
            await removePlayerAction({ teamId: props.teamId, playerId: props.playerId });
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
      title={err ?? "Remove player"}
    >
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}
