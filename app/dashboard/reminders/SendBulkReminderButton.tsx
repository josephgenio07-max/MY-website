"use client";

import { useMemo, useState } from "react";
import supabase from "@/lib/supabase";

export default function SendBulkReminderButton({
  teamId,
  mode,
  label,
  disabled,
}: {
  teamId: string;
  mode: "unpaid" | "due_soon";
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const defaultMsg =
    mode === "unpaid"
      ? "Hi — quick reminder your payment is still due. Please pay today. Thanks!"
      : "Hi — friendly reminder your payment is due soon. Please pay before the due date. Thanks!";

  const [msg, setMsg] = useState<string>(defaultMsg);
  const [days, setDays] = useState<number>(3);

  const hardDisabled = useMemo(() => {
    if (disabled) return true;
    if (!teamId) return true;
    return false;
  }, [disabled, teamId]);

  async function send() {
    if (!teamId) {
      setResult("Missing team id.");
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      
      if (!token) throw new Error("Not logged in. Please refresh the page.");

      const target =
        mode === "unpaid"
          ? ({ mode: "unpaid", teamId } as const)
          : ({ mode: "due_soon", teamId, days } as const);

      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          // Send the custom message - API will add payment link below it
          message: msg.trim(),
          kind: "manual",
          target,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to send.");

      setResult(`Sent: ${json.count} • Skipped (cooldown): ${json.skipped}`);
    } catch (e: any) {
      setResult(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        disabled={hardDisabled}
        onClick={() => {
          setResult(null);
          setMsg(defaultMsg);
          setOpen(true);
        }}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Send bulk reminder</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {mode === "unpaid"
                    ? "Sends to players who are due/overdue."
                    : "Sends to active players with a due date coming soon."}
                  <br />
                  <span className="text-gray-600">Payment link will be added automatically.</span>
                </p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            {mode === "due_soon" && (
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Days ahead</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 3)))}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your message
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                rows={4}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Enter your custom message..."
              />
              <p className="mt-2 text-xs text-gray-500">
                💡 Payment details and link will be automatically added below your message
              </p>
            </div>

            {result && <p className="mt-3 text-sm text-gray-700">{result}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={send}
                disabled={busy || !msg.trim() || !teamId}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
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