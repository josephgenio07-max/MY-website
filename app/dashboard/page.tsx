// ✅ Replace FULL FILE: app/dashboard/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

import SendBulkReminderButton from "./reminders/SendBulkReminderButton";
import SendSingleReminderButton from "./reminders/SendSingleReminderButton";
import MarkPaidButton from "./MarkPaidButton";
import SetCustomAmountButton from "./components/SetCustomAmountButton";

export const dynamic = "force-dynamic";

type Team = {
  id: string;
  name: string;
  expected_players: number | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_card_payments: string | null;
  archived_at?: string | null;
};

type Player = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

type MembershipRow = {
  id: string;
  team_id: string;
  status: "pending" | "active" | "due" | "overdue" | "canceled";
  billing_type: "subscription" | "one_off" | "bank_transfer" | "manual";
  plan_interval: string | null;
  next_due_at: string | null;
  last_paid_at: string | null;
  custom_amount_gbp: number | null;
  player: Player;
};

type Plan = {
  amount: number; // cents
  currency: string;
  interval: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: MembershipRow["status"] }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    due: "bg-amber-50 text-amber-700 border-amber-200",
    overdue: "bg-rose-50 text-rose-700 border-rose-200",
    canceled: "bg-gray-50 text-gray-600 border-gray-200",
    pending: "bg-gray-50 text-gray-600 border-gray-200",
  };

  const label = status === "due" ? "due" : status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? styles.pending
      }`}
    >
      {label}
    </span>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent" />
        <p className="mt-3 text-sm text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );
}

/**
 * CreatePaymentLinkCard
 * - Standalone (NOT inside Players table)
 * - Generates a shareable payment link for the selected team
 *
 * IMPORTANT:
 * This calls POST /api/payment-link/create
 * You MUST have that API route returning: { url: string }
 * If your existing API is different, change the endpoint + payload here.
 */
function CreatePaymentLinkCard({
  teamId,
  defaultAmountGBP,
}: {
  teamId: string;
  defaultAmountGBP: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [amountGBP, setAmountGBP] = useState<string>(String(defaultAmountGBP || 5));
  const [billingType, setBillingType] = useState<"one_off" | "subscription">("one_off");
  const [interval, setInterval] = useState<"week" | "month" | "quarter">("month");
  const [dueDate, setDueDate] = useState<string>(""); // YYYY-MM-DD optional

  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Failed to copy");
    }
  }

  async function apiCall(endpoint: string, body: any) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    if (!res.ok) throw new Error(json?.error || text || "API request failed");
    return json;
  }

  async function createLink() {
    setBusy(true);
    setErr(null);
    setCreatedUrl(null);

    try {
      const n = Number(amountGBP);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a valid amount.");

      const json = await apiCall("/api/payment-link/create", {
        teamId,
        amount_gbp: Number(n.toFixed(2)),
        billing_type: billingType,
        interval: billingType === "subscription" ? interval : null,
        due_date: dueDate.trim() ? dueDate.trim() : null,
      });

      if (!json?.url) throw new Error("API did not return a link.");
      setCreatedUrl(String(json.url));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Create payment link</h3>
          <p className="mt-1 text-sm text-gray-600">
            Generate a shareable link for one-off payments or subscriptions. Not tied to any player row.
          </p>
        </div>

        <button
          onClick={() => {
            setOpen(true);
            setErr(null);
            setCreatedUrl(null);
          }}
          className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Create link
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100">
            <div className="p-5 sm:p-6 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-lg font-semibold text-gray-900">New payment link</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Keep it simple. Amount + type. Optional due date.
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£)</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={amountGBP}
                    onChange={(e) => setAmountGBP(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value as any)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="one_off">One-off</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </div>
              </div>

              {billingType === "subscription" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Interval</label>
                    <select
                      value={interval}
                      onChange={(e) => setInterval(e.target.value as any)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="quarter">Quarterly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
              )}

              {billingType === "one_off" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              )}

              {err && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
              )}

              {createdUrl && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-600 uppercase">Payment link</p>
                  <code className="mt-1 block text-sm text-gray-800 break-all">{createdUrl}</code>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => copy(createdUrl)}
                      className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      Copy
                    </button>
                    <a
                      href={createdUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
                    >
                      Open
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createLink}
                disabled={busy}
                className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create payment link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [joinLink, setJoinLink] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [collectedThisMonthCents, setCollectedThisMonthCents] = useState<number>(0);

  const [unreadCount, setUnreadCount] = useState<number>(0);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const hasTeamSelected = Boolean(selectedTeamId);

  const stats = useMemo(() => {
    const total = memberships.length;
    const expected = selectedTeam?.expected_players ?? null;
    const paid = memberships.filter((m) => m.status === "active").length;
    const due = memberships.filter((m) => m.status === "due").length;
    const overdue = memberships.filter((m) => m.status === "overdue").length;
    const unpaid = due + overdue;
    return { total, expected, paid, due, overdue, unpaid };
  }, [memberships, selectedTeam]);

  const collectedGBP = (collectedThisMonthCents / 100).toFixed(2);
  const planAmountGBP = plan ? (plan.amount / 100).toFixed(2) : "—";
  const teamDefaultGBP = plan ? plan.amount / 100 : 5;

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Failed to copy");
    }
  }

  async function apiCall(endpoint: string, body: any) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    if (!res.ok) throw new Error(json?.error || text || "API request failed");
    return json;
  }

  async function getOrCreateJoinLink(teamId: string) {
    const json = await apiCall("/api/join-link/get-or-create", { teamId });
    return `${window.location.origin}/join/${json.token}`;
  }

  async function rotateJoinLinkApi(teamId: string) {
    const json = await apiCall("/api/join-link/rotate", { teamId });
    return `${window.location.origin}/join/${json.token}`;
  }

  function startOfMonthISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  async function loadTeamData(teamId: string) {
    setError(null);
    setJoinLink(null);
    setMemberships([]);
    setPlan(null);
    setCollectedThisMonthCents(0);

    // Join link
    try {
      const url = await getOrCreateJoinLink(teamId);
      setJoinLink(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load join link");
    }

    // Plan
    const { data: planRow } = await supabase
      .from("team_plans")
      .select("amount, currency, interval")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planRow) setPlan(planRow as Plan);

    // Memberships
    const { data: memRows, error: memErr } = await supabase
      .from("memberships")
      .select(
        `
        id,
        team_id,
        status,
        billing_type,
        plan_interval,
        next_due_at,
        last_paid_at,
        custom_amount_gbp,
        player:players!inner (id, name, email, phone)
      `
      )
      .eq("team_id", teamId)
      .neq("status", "canceled");

    if (memErr) {
      setError(memErr.message);
      return;
    }

    setMemberships((memRows ?? []) as unknown as MembershipRow[]);

    // Collected this month
    const { data: payRows } = await supabase
      .from("payments")
      .select("amount")
      .eq("team_id", teamId)
      .eq("status", "paid")
      .gte("created_at", startOfMonthISO());

    if (payRows) {
      const sum = payRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0);
      setCollectedThisMonthCents(sum);
    }
  }

  async function refreshTeam() {
    if (!selectedTeamId) return;
    setBusy(true);
    setError(null);
    try {
      await loadTeamData(selectedTeamId);
    } finally {
      setBusy(false);
    }
  }

  async function rotateJoinLink() {
    if (!selectedTeamId) return;
    setBusy(true);
    setError(null);
    try {
      const url = await rotateJoinLinkApi(selectedTeamId);
      setJoinLink(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate join link");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  // Init + teams
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }
      if (cancelled) return;

      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id, name, expected_players, stripe_account_id, stripe_charges_enabled, stripe_card_payments, archived_at")
        .eq("manager_id", data.user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (teamErr) {
        setError(teamErr.message);
        setLoading(false);
        return;
      }

      const list = (teamRows ?? []) as Team[];
      setTeams(list);

      // pick team from (1) URL teamId (Stripe return), else (2) localStorage selectedTeamId, else first team
      const urlTeamId = (sp.get("teamId") || "").trim();
      let storedTeamId = "";
      try {
        storedTeamId = (window.localStorage.getItem("selectedTeamId") || "").trim();
      } catch {}

      const initial =
        (urlTeamId && list.some((t) => t.id === urlTeamId) && urlTeamId) ||
        (storedTeamId && list.some((t) => t.id === storedTeamId) && storedTeamId) ||
        (list[0]?.id ?? null);

      setSelectedTeamId(initial || null);

      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router, sp]);

  // Load team data when team changes
  useEffect(() => {
    if (!selectedTeamId) return;
    loadTeamData(selectedTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  // Notifications badge polling
  useEffect(() => {
    let alive = true;

    async function loadUnreadCount() {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !alive) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("manager_id", data.user.id)
        .eq("is_read", false);

      if (!alive) return;
      setUnreadCount(count || 0);
    }

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) return <DashboardLoading />;

  return (
    <main className="min-h-[100dvh] bg-gray-50">
      {/* Sticky header (mobile friendly) */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Dashboard</h1>
              <p className="hidden sm:block text-sm text-gray-500">Manage your team payments</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/notifications")}
                className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                aria-label="Notifications"
                title="Notifications"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>

                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => router.push("/settings?returnTo=/dashboard")}
                className="rounded-lg bg-gray-900 px-3 sm:px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Settings
              </button>

              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile logout (kept out of the top-right clutter) */}
          <div className="sm:hidden mt-3">
            <button
              onClick={handleLogout}
              className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {teams.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 sm:p-14 text-center shadow-sm">
            <div className="mx-auto max-w-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>

              <h2 className="mt-6 text-xl font-semibold text-gray-900">No teams yet</h2>
              <p className="mt-2 text-gray-600">Create your first team to start collecting payments.</p>

              <button
                onClick={() => router.push("/team/setup")}
                className="mt-8 w-full sm:w-auto rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Create your first team
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Team selector + actions */}
            <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Active team</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                      value={selectedTeamId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedTeamId(id);
                        try {
                          window.localStorage.setItem("selectedTeamId", id);
                        } catch {}
                      }}
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                    <button
                      onClick={() => selectedTeamId && router.push(`/team/${selectedTeamId}/settings`)}
                      disabled={!selectedTeamId}
                      className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Team settings
                    </button>

                    <button
                      onClick={() => router.push("/dashboard/teams?returnTo=/dashboard")}
                      className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Manage teams
                    </button>

                    <button
                      onClick={() => router.push("/team/setup")}
                      className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      Create new team
                    </button>
                  </div>

                  {plan && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-700 font-medium">
                        Plan: £{planAmountGBP}/{plan.interval}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 font-medium">
                        Collected: £{collectedGBP} this month
                      </span>
                    </div>
                  )}
                </div>

                {/* Stripe status card */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 lg:min-w-[240px]">
                  <p className="text-sm font-medium text-gray-900 mb-3">Stripe status</p>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Charges</span>
                      {selectedTeam?.stripe_charges_enabled ? (
                        <span className="font-medium text-emerald-600">Active</span>
                      ) : (
                        <span className="font-medium text-rose-600">Inactive</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Card payments</span>
                      {selectedTeam?.stripe_card_payments === "active" ? (
                        <span className="font-medium text-emerald-600">Ready</span>
                      ) : (
                        <span className="font-medium text-gray-500">Not ready</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => selectedTeamId && router.push(`/team/${selectedTeamId}/connect-stripe`)}
                    disabled={!selectedTeamId}
                    className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Configure
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-600">Players</p>
                <p className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>

              <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-600">Expected</p>
                <p className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">{stats.expected ?? "—"}</p>
              </div>

              <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-600">Paid</p>
                <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-600">{stats.paid}</p>
              </div>

              <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-600">Due/overdue</p>
                <p className="mt-2 text-2xl sm:text-3xl font-bold text-rose-600">{stats.unpaid}</p>
              </div>

              <div className="rounded-xl bg-white p-4 sm:p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-600">Collected</p>
                <p className="mt-2 text-2xl sm:text-3xl font-bold text-blue-600">£{collectedGBP}</p>
              </div>
            </div>

            {/* Join link */}
            <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Join link</h3>

              {joinLink ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <code className="flex-1 text-sm text-gray-700 break-all">{joinLink}</code>
                  </div>

                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                    <button
                      onClick={() => copyToClipboard(joinLink)}
                      className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      Copy link
                    </button>

                    <a
                      href={joinLink}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
                    >
                      Preview
                    </a>

                    <button
                      onClick={rotateJoinLink}
                      disabled={busy}
                      className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {busy ? "Working..." : "Rotate"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Loading...</p>
              )}
            </div>

            {/* ✅ NEW: Payment link card (standalone, NOT in players table) */}
            {selectedTeamId && (
              <CreatePaymentLinkCard teamId={selectedTeamId} defaultAmountGBP={teamDefaultGBP} />
            )}

            {/* Players */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-5 sm:p-6 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Players</h3>
                  <p className="text-sm text-gray-500">Remind, mark paid, or set custom amounts.</p>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                  {hasTeamSelected && (
                    <>
                      <SendBulkReminderButton teamId={selectedTeamId!} mode="unpaid" label="Remind unpaid" />
                      <SendBulkReminderButton teamId={selectedTeamId!} mode="due_soon" label="Remind due soon" />
                    </>
                  )}

                  <button
                    onClick={refreshTeam}
                    disabled={busy || !hasTeamSelected}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {busy ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>

              {memberships.length === 0 ? (
                <div className="p-10 sm:p-12 text-center">
                  <p className="text-gray-600 font-medium">No players yet</p>
                  <p className="mt-1 text-sm text-gray-500">Players appear after they join and make their first payment.</p>
                </div>
              ) : (
                <>
                  {/* ✅ Mobile: cards (no horizontal scroll hell) */}
                  <div className="block sm:hidden p-4 space-y-3">
                    {memberships.map((m) => {
                      const p = m.player;
                      const hasRowIds = hasTeamSelected && Boolean(m?.id) && Boolean(p?.id);

                      return (
                        <div key={m.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900 truncate">{p?.name ?? "—"}</p>
                                <StatusBadge status={m.status} />
                                {m.custom_amount_gbp !== null && (
                                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                    £{Number(m.custom_amount_gbp).toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-gray-600 break-all">{p?.email ?? "—"}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2">
                              <p className="text-[11px] text-gray-500 uppercase">Billing</p>
                              <p className="font-medium text-gray-900 capitalize">{m.billing_type}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2">
                              <p className="text-[11px] text-gray-500 uppercase">Last paid</p>
                              <p className="font-medium text-gray-900">{formatDate(m.last_paid_at)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2">
                              <p className="text-[11px] text-gray-500 uppercase">Next due</p>
                              <p className="font-medium text-gray-900">{formatDate(m.next_due_at)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 border border-gray-200 p-2">
                              <p className="text-[11px] text-gray-500 uppercase">Team</p>
                              <p className="font-medium text-gray-900 truncate">{selectedTeam?.name ?? "—"}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-col gap-2">
                            {hasRowIds ? (
                              <>
                                <div className="flex flex-wrap gap-2">
                                  <SendSingleReminderButton
                                    teamId={m.team_id}
                                    membershipId={m.id}
                                    playerName={p?.name ?? null}
                                  />
                                  <MarkPaidButton
                                    teamId={selectedTeamId!}
                                    playerId={p.id}
                                    defaultAmountCents={plan?.amount ?? 0}
                                    currency={(plan?.currency ?? "gbp") as string}
                                  />
                                  <SetCustomAmountButton
                                    membershipId={m.id}
                                    currentAmount={m.custom_amount_gbp}
                                    teamDefaultAmount={teamDefaultGBP}
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">Missing IDs</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ✅ Desktop: table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last paid</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next due</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-100">
                        {memberships.map((m) => {
                          const p = m.player;
                          const hasRowIds = hasTeamSelected && Boolean(m?.id) && Boolean(p?.id);

                          return (
                            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium text-gray-900">{p?.name ?? "—"}</div>

                                  {m.custom_amount_gbp !== null && (
                                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                      £{Number(m.custom_amount_gbp).toFixed(2)}
                                    </span>
                                  )}
                                </div>

                                <div className="text-sm text-gray-500">{p?.email ?? "—"}</div>
                              </td>

                              <td className="px-6 py-4">
                                <StatusBadge status={m.status} />
                              </td>

                              <td className="px-6 py-4 text-sm text-gray-700">
                                <div className="capitalize">{m.billing_type}</div>
                              </td>

                              <td className="px-6 py-4 text-sm text-gray-700">{formatDate(m.last_paid_at)}</td>
                              <td className="px-6 py-4 text-sm text-gray-700">{formatDate(m.next_due_at)}</td>

                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-2">
                                  {hasRowIds ? (
                                    <>
                                      <SendSingleReminderButton
                                        teamId={m.team_id}
                                        membershipId={m.id}
                                        playerName={p?.name ?? null}
                                      />

                                      <MarkPaidButton
                                        teamId={selectedTeamId!}
                                        playerId={p.id}
                                        defaultAmountCents={plan?.amount ?? 0}
                                        currency={(plan?.currency ?? "gbp") as string}
                                      />

                                      <SetCustomAmountButton
                                        membershipId={m.id}
                                        currentAmount={m.custom_amount_gbp}
                                        teamDefaultAmount={teamDefaultGBP}
                                      />
                                    </>
                                  ) : (
                                    <span className="text-xs text-gray-400">Missing IDs</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
