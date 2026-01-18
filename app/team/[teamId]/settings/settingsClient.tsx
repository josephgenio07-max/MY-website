"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Team = {
  id: string;
  name: string;
  expected_players: number | null;
  due_interval: "week" | "month" | "quarter" | null;
  due_weekday: number | null;
  due_day: number | null;
  due_quarter_month: number | null;
};

type Plan =
  | {
      amount: number; // cents
      currency: string;
      interval: "week" | "month" | "quarter";
      allow_card_one_off: boolean;
      allow_card_recurring: boolean;
      allow_bank_transfer: boolean;
      bank_instructions: string | null;
    }
  | null;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cleanName(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function toNumberOrNull(s: string) {
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

const inputCls =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 placeholder:text-gray-500 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400";

const selectCls =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400";

const checkboxCls = "h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900";

export default function SettingsClient({ team, plan }: { team: Team; plan: Plan }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [err, setErr] = useState<string | null>(null);
  const [busyTeam, setBusyTeam] = useState(false);
  const [busyPlan, setBusyPlan] = useState(false);

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
    if (dueInterval === "week") return `Every ${weekdays[Math.max(0, Math.min(6, dueWeekday))]}`;
    if (dueInterval === "month") return `Every month on day ${Math.max(1, Math.min(28, dueDay))}`;
    return `Every quarter (month ${Math.max(1, Math.min(3, dueQuarterMonth))} of the quarter) on day ${Math.max(
      1,
      Math.min(28, dueDay)
    )}`;
  }, [dueInterval, dueWeekday, dueDay, dueQuarterMonth]);

  async function logout() {
    setErr(null);
    await supabase.auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

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

    setBusyTeam(true);
    try {
      const { error } = await supabase.from("teams").update(payload).eq("id", team.id);
      if (error) return setErr(error.message);

      router.refresh();
    } finally {
      setBusyTeam(false);
    }
  }

  async function onSavePlan() {
    setErr(null);

    const amount = Number(amountGBP);
    if (!Number.isFinite(amount) || amount < 0.5 || amount > 9999) {
      return setErr("Amount must be between £0.50 and £9999.");
    }
    const amountCents = Math.round(amount * 100);

    if (!allowOneOff && !allowRecurring && !allowBank) {
      return setErr("Enable at least one payment method.");
    }
    if (allowBank && bankInstructions.trim().length < 10) {
      return setErr("Bank instructions look too short.");
    }

    setBusyPlan(true);
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
      setBusyPlan(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <header className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">Team Settings</h1>
            <p className="text-sm text-gray-700 truncate">{team.name}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={logout}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Log out
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </header>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-900">
            {err}
          </div>
        )}

        {/* Team */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-gray-200 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Team</h2>
            <p className="text-sm text-gray-700">Update the basics for this team.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busyTeam || busyPlan}
              className={inputCls}
              placeholder="Team name"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Expected players</label>
            <input
              value={expectedPlayers}
              onChange={(e) => setExpectedPlayers(e.target.value)}
              disabled={busyTeam || busyPlan}
              inputMode="numeric"
              className={inputCls}
              placeholder="e.g. 15"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Due schedule</label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={dueInterval}
                onChange={(e) => setDueInterval(e.target.value as any)}
                disabled={busyTeam || busyPlan}
                className={selectCls}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>

              {dueInterval === "week" && (
                <select
                  value={dueWeekday}
                  onChange={(e) => setDueWeekday(Number(e.target.value))}
                  disabled={busyTeam || busyPlan}
                  className={selectCls}
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
                  disabled={busyTeam || busyPlan}
                  className={selectCls}
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
                  disabled={busyTeam || busyPlan}
                  className={selectCls}
                >
                  <option value={1}>Month 1</option>
                  <option value={2}>Month 2</option>
                  <option value={3}>Month 3</option>
                </select>
              )}
            </div>

            <div className="text-xs font-medium text-gray-700">Current: {scheduleHint}</div>
          </div>

          <button
            onClick={onSaveTeam}
            disabled={busyTeam || busyPlan}
            className="w-full sm:w-auto rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busyTeam ? "Saving..." : "Save team settings"}
          </button>
        </section>

        {/* Plan */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-gray-200 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Plan</h2>
            <p className="text-sm text-gray-700">Change amount, frequency, and allowed payment types.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-900">Amount (£)</label>
              <input
                value={amountGBP}
                onChange={(e) => setAmountGBP(e.target.value)}
                disabled={busyTeam || busyPlan}
                inputMode="decimal"
                className={inputCls}
                placeholder="20.00"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-900">Frequency</label>
              <select
                value={planInterval}
                onChange={(e) => setPlanInterval(e.target.value as any)}
                disabled={busyTeam || busyPlan}
                className={selectCls}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Payment methods</label>

            <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
              <input
                className={checkboxCls}
                type="checkbox"
                checked={allowOneOff}
                disabled={busyTeam || busyPlan}
                onChange={(e) => setAllowOneOff(e.target.checked)}
              />
              Card (one-off)
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
              <input
                className={checkboxCls}
                type="checkbox"
                checked={allowRecurring}
                disabled={busyTeam || busyPlan}
                onChange={(e) => setAllowRecurring(e.target.checked)}
              />
              Card (recurring)
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
              <input
                className={checkboxCls}
                type="checkbox"
                checked={allowBank}
                disabled={busyTeam || busyPlan}
                onChange={(e) => setAllowBank(e.target.checked)}
              />
              Bank transfer
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">Bank instructions</label>
            <textarea
              value={bankInstructions}
              onChange={(e) => setBankInstructions(e.target.value)}
              disabled={busyTeam || busyPlan || !allowBank}
              rows={5}
              className={`${inputCls} ${!allowBank ? "opacity-60" : ""}`}
              placeholder="Sort code, account number, reference format…"
            />
            {!allowBank && <div className="text-xs font-medium text-gray-700">Enable bank transfer to edit.</div>}
          </div>

          <button
            onClick={onSavePlan}
            disabled={busyTeam || busyPlan}
            className="w-full sm:w-auto rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busyPlan ? "Saving..." : "Save plan settings"}
          </button>
        </section>
      </div>
    </main>
  );
}
