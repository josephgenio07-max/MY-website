"use client";

import { useMemo, useState, useTransition } from "react";
import { sendReminder } from "./actions";

export default function SendReminderButton(props: {
  teamId: string;
  membershipId: string;
  disabled?: boolean;
  hasPhone?: boolean;
  hasConsent?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hardDisabled = useMemo(() => {
    if (props.disabled) return true;
    if (!props.teamId) return true;
    if (!props.membershipId) return true;
    return false;
  }, [props.disabled, props.teamId, props.membershipId]);

  function humanizeError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("cooldown")) return "Already reminded recently.";
    if (m.includes("no phone")) return "No phone saved for this player.";
    if (m.includes("no consent")) return "No consent for reminders.";
    if (m.includes("missing membershipid") || m.includes("missing membership id")) return "Missing membership.";
    return message;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-60"
        disabled={hardDisabled || isPending}
        onClick={() => {
          setErr(null);
          setOk(null);

          if (!props.teamId || !props.membershipId) {
            setErr("Missing team/membership id.");
            return;
          }

          if (props.hasPhone === false) {
            setErr("No phone saved for this player.");
            return;
          }
          if (props.hasConsent === false) {
            setErr("No consent for reminders.");
            return;
          }

          startTransition(async () => {
            try {
              // Don't pass message - let API generate it with payment link
              await sendReminder({
                teamId: props.teamId,
                membershipId: props.membershipId,
              });
              setOk("Sent");
            } catch (e: any) {
              setErr(humanizeError(e?.message ?? "Failed"));
            }
          });
        }}
      >
        {isPending ? "Sending…" : "Send reminder"}
      </button>

      {ok && <div className="text-[11px] text-green-700">{ok}</div>}
      {err && <div className="text-[11px] text-red-600">{err}</div>}
    </div>
  );
}