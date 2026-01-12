"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

export default function SendSingleReminderButton(props: {
  teamId: string;
  membershipId: string;
  playerName?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
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

  async function send() {
    setBusy(true);
    setResult(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in. Please refresh the page.");

      const res = await fetch("/api/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: props.teamId,
          message: msg.trim(),
          kind: "manual",
          target: { mode: "single", membershipId: props.membershipId },
        }),
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Failed to send reminder.");

      const r0 = Array.isArray(json?.results) ? json.results[0] : null;

      if (r0?.sent === true) setResult("Reminder sent.");
      else if (r0?.reason === "cooldown") setResult("Already reminded recently.");
      else if (r0?.reason === "no_consent") setResult("No consent for reminders.");
      else if (r0?.reason === "delivery_failed") setResult("Delivery failed (no working contact).");
      else setResult("Reminder not sent.");

      setOpen(false);
    } catch (e: any) {
      setResult((e?.message ?? "Failed").toString());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        disabled={hardDisabled || busy}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        {busy ? "Sending…" : "Remind"}
      </button>

      {result && <div className="text-[11px] text-red-600 mt-1">{result}</div>}

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
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your message
              </label>
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
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={send}
                disabled={busy || !msg.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
