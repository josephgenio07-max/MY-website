"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

export default function SendSingleReminderButton({
  teamId,
  membershipId,
  playerName,
  disabled,
}: {
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
    setMsg(`Hi${playerName ? ` ${playerName}` : ""} — quick reminder your payment is due. Thanks!`);
  }, [playerName]);

  const hardDisabled = useMemo(() => {
    if (disabled) return true;
    if (!teamId) return true;
    if (!membershipId) return true;
    return false;
  }, [disabled, teamId, membershipId]);

  async function send() {
    setBusy(true);
    setResult(null);

    try {
      if (!teamId || !membershipId) throw new Error("Missing team or membership id.");

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      
      if (!token) throw new Error("Not logged in. Please refresh the page.");

      const res = await fetch("/api/reminders/send-single", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          membershipId,
          message: msg,
        }),
      });

      // Check content type before parsing
      const contentType = res.headers.get("content-type");
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response:", text.substring(0, 200));
        throw new Error("Server error. Check console for details.");
      }

      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json?.error || "Failed to send.");
      }

      setResult(`Sent via ${json.channel || "unknown"}`);
      setOpen(false);
    } catch (e: any) {
      const message = (e?.message ?? "Failed").toString();
      const m = message.toLowerCase();
      
      if (m.includes("cooldown")) setResult("Already reminded recently.");
      else if (m.includes("no consent")) setResult("No consent for reminders.");
      else if (m.includes("no phone")) setResult("No phone saved for this player.");
      else if (m.includes("no contact")) setResult("No email or phone for this player.");
      else setResult(message);
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
          if (!teamId || !membershipId) {
            setResult("Missing team/membership id.");
            return;
          }
          setOpen(true);
        }}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Remind
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Send reminder</h3>
                <p className="mt-1 text-sm text-gray-500">Sends only to this player (cooldown enforced).</p>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <textarea
              className="mt-4 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-gray-900"
              rows={6}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />

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
                disabled={busy || !msg.trim() || !teamId || !membershipId}
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