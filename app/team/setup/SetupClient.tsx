"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

function makeToken(length = 40) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type Interval = "week" | "month" | "quarter";

const inputCls =
  "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 " +
  "placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400";

const selectCls =
  "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 " +
  "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400";

const checkboxCls = "h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900";

export default function SetupClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const supabase = useMemo(() => supabaseBrowser(), []);

  const returnToRaw = (sp.get("returnTo") || "").trim();
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/dashboard";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [joinLink, setJoinLink] = useState<string | null>(null);

  const [teamName, setTeamName] = useState("");
  const [expectedPlayers, setExpectedPlayers] = useState<number>(26);

  const [amount, setAmount] = useState<number>(20);
  const [interval, setInterval] = useState<Interval>("month");

  const [dueWeekday, setDueWeekday] = useState<number>(1);
  const [dueDayOfMonth, setDueDayOfMonth] = useState<number>(1);
  const [dueMonthInQuarter, setDueMonthInQuarter] = useState<1 | 2 | 3>(1);

  const [enableCard, setEnableCard] = useState(true);
  const [enableRecurring, setEnableRecurring] = useState(true);
  const [enableBank, setEnableBank] = useState(false);

  const [bankInstructions, setBankInstructions] = useState(
    "Account name:\nSort code:\nAccount number:\nReference (players must use):"
  );

  const methodsEnabled = useMemo(() => {
    const m: string[] = [];
    if (enableCard) m.push("stripe_one_time");
    if (enableRecurring) m.push("stripe_recurring");
    if (enableBank) m.push("bank_transfer");
    return m;
  }, [enableCard, enableRecurring, enableBank]);

  useEffect(() => {
    let alive = true;

    async function checkUser() {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr || !data.user) {
        router.replace("/auth/login");
        router.refresh();
        return;
      }

      setLoading(false);
    }

    checkUser();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  function validateDueSettings() {
    if (interval === "week") {
      if (![0, 1, 2, 3, 4, 5, 6].includes(dueWeekday)) return "Pick a valid due weekday.";
    } else {
      if (dueDayOfMonth < 1 || dueDayOfMonth > 31) return "Due day of month must be 1 to 31.";
    }
    if (interval === "quarter") {
      if (![1, 2, 3].includes(dueMonthInQuarter)) return "Quarter month must be 1, 2, or 3.";
    }
    return null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setError(null);
    setJoinLink(null);
    setTeamId(null);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      router.replace("/auth/login");
      router.refresh();
      return;
    }

    const name = teamName.trim();
    if (!name) return setError("Team name is required.");

    const expected = Number(expectedPlayers);
    if (!Number.isFinite(expected) || expected < 1) return setError("Expected players must be at least 1.");

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return setError("Amount must be at least 1.");

    if (methodsEnabled.length === 0) return setError("Enable at least one payment method.");

    if (enableBank && bankInstructions.trim().length < 10) {
      return setError("Please provide proper bank transfer instructions.");
    }

    const dueErr = validateDueSettings();
    if (dueErr) return setError(dueErr);

    setSaving(true);

    try {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          name,
          manager_id: authData.user.id,
          expected_players: expected,
          due_weekday: interval === "week" ? dueWeekday : null,
          due_day_of_month: interval !== "week" ? dueDayOfMonth : null,
          due_month_in_quarter: interval === "quarter" ? dueMonthInQuarter : null,
          stripe_account_id: null,
          stripe_charges_enabled: null,
          stripe_card_payments: null,
        })
        .select("id")
        .single();

      if (teamError) throw teamError;

      setTeamId(team.id);

      const { error: planError } = await supabase.from("team_plans").insert({
        team_id: team.id,
        amount: Math.round(amt * 100),
        currency: "gbp",
        interval,
        methods_enabled: methodsEnabled,
        bank_instructions: enableBank ? bankInstructions.trim() : null,
        active: true,
      });

      if (planError) throw planError;

      const token = makeToken();
      const { error: linkError } = await supabase.from("join_links").insert({
        team_id: team.id,
        token,
        active: true,
      });

      if (linkError) throw linkError;

      setJoinLink(`${window.location.origin}/join/${token}`);
    } catch (err: any) {
      setError(err?.message || "Failed to create team.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center px-4">
        <div className="rounded-2xl bg-white border border-gray-200 p-6 w-full max-w-md text-center">
          <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
          <p className="mt-3 text-sm font-medium text-gray-800">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-8 shadow-sm border border-gray-200">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => router.push(returnTo)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            ← Back
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">Set up your team</h1>
        <p className="mt-2 text-sm text-gray-700">
          Create a team, set the due schedule, and generate a join link for players.
        </p>

        <form onSubmit={handleCreate} className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-900">Team name</label>
              <input
                className={inputCls}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Sunday Lions FC"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900">Expected players</label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={expectedPlayers}
                onChange={(e) => setExpectedPlayers(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-900">Amount (£)</label>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900">Frequency</label>
              <select
                className={selectCls}
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900">Due schedule</p>
            <p className="mt-1 text-xs text-gray-700">Set when payments are due to prevent drift from late payments.</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {interval === "week" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900">Due weekday</label>
                  <select
                    className={selectCls}
                    value={dueWeekday}
                    onChange={(e) => setDueWeekday(Number(e.target.value))}
                  >
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                    <option value={0}>Sunday</option>
                  </select>
                </div>
              )}

              {interval !== "week" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900">Due day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={inputCls}
                    value={dueDayOfMonth}
                    onChange={(e) => setDueDayOfMonth(Number(e.target.value))}
                  />
                  <p className="mt-1 text-xs text-gray-700">Example: 1 = due every 1st.</p>
                </div>
              )}

              {interval === "quarter" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900">Month in quarter</label>
                  <select
                    className={selectCls}
                    value={dueMonthInQuarter}
                    onChange={(e) => setDueMonthInQuarter(Number(e.target.value) as 1 | 2 | 3)}
                  >
                    <option value={1}>1st month of quarter</option>
                    <option value={2}>2nd month of quarter</option>
                    <option value={3}>3rd month of quarter</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900">Payment methods</p>

            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
                <input
                  className={checkboxCls}
                  type="checkbox"
                  checked={enableCard}
                  onChange={(e) => setEnableCard(e.target.checked)}
                />
                Card (one-off)
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
                <input
                  className={checkboxCls}
                  type="checkbox"
                  checked={enableRecurring}
                  onChange={(e) => setEnableRecurring(e.target.checked)}
                />
                Card (subscription)
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
                <input
                  className={checkboxCls}
                  type="checkbox"
                  checked={enableBank}
                  onChange={(e) => setEnableBank(e.target.checked)}
                />
                Bank transfer
              </label>

              {enableBank && (
                <textarea
                  className={`${inputCls} mt-2`}
                  rows={6}
                  value={bankInstructions}
                  onChange={(e) => setBankInstructions(e.target.value)}
                />
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
              {error}
            </div>
          )}

          <button
            disabled={saving}
            className="w-full rounded-xl bg-gray-900 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create team & join link"}
          </button>
        </form>

        {joinLink && (
          <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">
            <p className="font-semibold text-green-900">Join link ready</p>
            <p className="mt-2 break-all text-sm font-medium text-green-900">{joinLink}</p>

            <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(joinLink)}
                className="rounded-xl bg-green-900 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Copy link
              </button>

              <button
                type="button"
                disabled={!teamId}
                onClick={() => teamId && router.push(`/team/${teamId}/connect-stripe`)}
                className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Connect Stripe
              </button>

              <button
                type="button"
                onClick={() => router.push(returnTo)}
                className="rounded-xl border border-green-300 bg-white px-4 py-2.5 text-sm font-semibold text-green-900"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
