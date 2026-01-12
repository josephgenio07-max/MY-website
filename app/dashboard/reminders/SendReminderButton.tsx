"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { sendReminder } from "./actions";

export default function SendReminderButton(props: {
  teamId: string;
  membershipId: string;
  playerName?: string | null;
  disabled?: boolean;
  hasPhone?: boolean;
  hasConsent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMsg(
      `Hi${props.playerName ? ` ${props.playerName}` : ""}, quick reminder your payment is due. Thanks!`
    );
  }, [props.playerName]);

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
    if (m.includes("not allowed")) return "You don’t own this team.";
    if (m.includes("not logged in")) return "You’re not logged in.";
    if (m.includes("membership")) return "Membership not found (wrong ID).";
    return message;
  }

  function handleClick() {
    setErr(null);
    setOk(null);

    if (!props.teamId || !props.membershipId) {
      setErr("Missing team/membership id.");
      return;
    }
    if (props.hasConsent === false) {
      setErr("No consent for reminders.");
      return;
    }

    setOpen(true);
  }

  function send() {
    startTransition(async () => {
      try {
        await sendReminder({
          teamId: props.teamId,
          membershipId: props.membershipId,
          message: msg.trim(),
        });
        setOk("Sent");
        setOpen(false);
      } catch (e: any) {
        setErr(humanizeError((e?.message ?? "Failed").toString()));
      }
    });
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-60"
          disabled={hardDisabled || isPending}
          onClick={handleClick}
        >
          {isPending ? "Sending…" : "Send reminder"}
        </button>

        {ok && <div className="text-[11px] text-green-700">{ok}</div>}
        {err && <div className="text-[11px] text-red-600">{err}</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Send reminder</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Customize your message. Payment link will be added automatically.
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Your message</label>
              <textarea
                className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                rows={4}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={send}
                disabled={isPending || !msg.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
