"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  expected_players: number | null;
  due_interval: "week" | "month" | "quarter" | null;
  due_weekday: number | null;
  due_day: number | null;
  due_quarter_month: number | null;
};

type Plan = {
  amount: number; // cents
  currency: string;
  interval: "week" | "month" | "quarter";
  allow_card_one_off: boolean;
  allow_card_recurring: boolean;
  allow_bank_transfer: boolean;
  bank_instructions: string | null;
} | null;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cleanName(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function toNumberOrNull(s: string) {
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export default function SettingsClient({ team, plan }: { team: Team; plan: Plan }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Team settings state
  const [name, setName] = useState(team.name);
  const [expectedPlayers, setExpectedPlayers] = useState<string>(team.expected_players?.toString() ?? "");
  const [dueInterval, setDueInterval] = useState<"week" | "month" | "quarter">(
    (team.due_interval as any) || "month"
  );
  const [dueWeekday, setDueWeekday] = useState<number>(team.due_weekday ?? 1);
  const [dueDay, setDueDay] = useState<number>(team.due_day ?? 1);
  const [dueQuarterMonth, setDueQuarterMonth] = useState<number>(team.due_quarter_month ?? 1);

  // Plan settings state
  const [amountGBP, setAmountGBP] = useState<string>(plan ? (plan.amount / 100).toFixed(2) : "20.00");
  const [planInterval, setPlanInterval] = useState<"week" | "month" | "quarter">(plan?.interval ?? "month");
  const [allowOneOff, setAllowOneOff] = useState<boolean>(plan?.allow_card_one_off ?? true);
  const [allowRecurring, setAllowRecurring] = useState<boolean>(plan?.allow_card_recurring ?? false);
  const [allowBank, setAllowBank] = useState<boolean>(plan?.allow_bank_transfer ?? false);
  const [bankInstructions, setBankInstructions] = useState<string>(plan?.bank_instructions ?? "");

  const scheduleHint = useMemo(() => {
    if (dueInterval === "week") return `Every ${weekdays[dueWeekday]}`;
    if (dueInterval === "month") return `Every month on day ${dueDay}`;
    return `Every quarter (month ${dueQuarterMonth} of the quarter) on day ${dueDay}`;
  }, [dueInterval, dueWeekday, dueDay, dueQuarterMonth]);

  async function onSaveTeam() {
    setErr(null);

    const n = cleanName(name);
    if (n.length < 2) return setErr("Team name too short.");
    if (n.length > 60) return setErr("Team name too long.");

    const expectedRaw = expectedPlayers.trim();
    const expectedNum = expectedRaw === "" ? null : toNumberOrNull(expectedRaw);
    if (expectedNum !== null) {
      if (!Number.isInteger(expectedNum)) return setErr("Expected players must be a whole number.");
      if (expectedNum < 1 || expectedNum > 200) return setErr("Expected players must be between 1 and 200.");
    }

    const payload: any = {
      name: n,
      expected_players: expectedNum,
      due_interval: dueInterval,
      due_weekday: dueInterval === "week" ? Math.max(0, Math.min(6, dueWeekday)) : null,
      due_day: dueInterval === "month" || dueInterval === "quarter" ? Math.max(1, Math.min(28, dueDay)) : null,
      due_quarter_month: dueInterval === "quarter" ? Math.max(1, Math.min(3, dueQuarterMonth)) : null,
    };

    setBusy(true);
    try {
      const { error } = await supabase.from("teams").update(payload).eq("id", team.id);
      if (error) return setErr(error.message);

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onSavePlan() {
    setErr(null);

    const amount = Number(amountGBP);
    if (!Number.isFinite(amount) || amount < 0.5 || amount > 9999) {
      return setErr("Amount must be between £0.50 and £9999.");
    }
    const amountCents = Math.round(amount * 100);

    setBusy(true);
    try {
      // deactivate existing active plan (keep history)
      const { error: deactErr } = await supabase
        .from("team_plans")
        .update({ active: false })
        .eq("team_id", team.id)
        .eq("active", true);

      if (deactErr) return setErr(deactErr.message);

      const { error: insErr } = await supabase.from("team_plans").insert({
        team_id: team.id,
        amount: amountCents,
        currency: "gbp",
        interval: planInterval,
        active: true,
        allow_card_one_off: !!allowOneOff,
        allow_card_recurring: !!allowRecurring,
        allow_bank_transfer: !!allowBank,
        bank_instructions: allowBank ? bankInstructions.trim() : null,
      });

      if (insErr) return setErr(insErr.message);

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Team Settings</h1>
            <p className="text-sm text-gray-600">{team.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/auth/login");
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Log out
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </div>

        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        {/* Team */}
        <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Team</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected players</label>
            <input
              value={expectedPlayers}
              onChange={(e) => setExpectedPlayers(e.target.value)}
              disabled={busy}
              inputMode="numeric"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g. 15"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due schedule</label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={dueInterval}
                onChange={(e) => setDueInterval(e.target.value as any)}
                disabled={busy}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>

              {dueInterval === "week" && (
                <select
                  value={dueWeekday}
                  onChange={(e) => setDueWeekday(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                >
                  {weekdays.map((w, i) => (
                    <option key={w} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              )}

              {(dueInterval === "month" || dueInterval === "quarter") && (
                <select
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                </select>
              )}

              {dueInterval === "quarter" && (
                <select
                  value={dueQuarterMonth}
                  onChange={(e) => setDueQuarterMonth(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value={1}>Month 1</option>
                  <option value={2}>Month 2</option>
                  <option value={3}>Month 3</option>
                </select>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-600">Current: {scheduleHint}</div>
          </div>

          <button
            onClick={onSaveTeam}
            disabled={busy}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save team settings"}
          </button>
        </section>

        {/* Plan */}
        <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Plan</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£)</label>
              <input
                value={amountGBP}
                onChange={(e) => setAmountGBP(e.target.value)}
                disabled={busy}
                inputMode="decimal"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={planInterval}
                onChange={(e) => setPlanInterval(e.target.value as any)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Payment methods</label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowOneOff}
                disabled={busy}
                onChange={(e) => setAllowOneOff(e.target.checked)}
              />
              Card (one-off)
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowRecurring}
                disabled={busy}
                onChange={(e) => setAllowRecurring(e.target.checked)}
              />
              Card (recurring)
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowBank}
                disabled={busy}
                onChange={(e) => setAllowBank(e.target.checked)}
              />
              Bank transfer
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank instructions</label>
            <textarea
              value={bankInstructions}
              onChange={(e) => setBankInstructions(e.target.value)}
              disabled={busy || !allowBank}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:opacity-60"
              placeholder="e.g. Sort code, account number, reference format…"
            />
            {!allowBank && <div className="mt-1 text-xs text-gray-500">Enable bank transfer to edit.</div>}
          </div>

          <button
            onClick={onSavePlan}
            disabled={busy}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save plan settings"}
          </button>
        </section>
      </div>
    </main>
  );
}
