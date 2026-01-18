"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import SettingsClient from "./settingsClient";

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
      amount: number;
      currency: string;
      interval: "week" | "month" | "quarter";
      allow_card_one_off: boolean;
      allow_card_recurring: boolean;
      allow_bank_transfer: boolean;
      bank_instructions: string | null;
    }
  | null;

export default function TeamSettingsPage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;

  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [plan, setPlan] = useState<Plan>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      if (!teamId) {
        setErr("Missing teamId in URL.");
        setLoading(false);
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setErr(userErr.message);
        setLoading(false);
        return;
      }
      if (!userData.user) {
        router.replace("/auth/login");
        router.refresh();
        return;
      }

      const { data: teamRow, error: teamErr } = await supabase
        .from("teams")
        .select("id, name, expected_players, due_interval, due_weekday, due_day, due_quarter_month")
        .eq("id", teamId)
        .single();

      if (cancelled) return;

      if (teamErr) {
        setErr(teamErr.message);
        setLoading(false);
        return;
      }

      const { data: planRow, error: planErr } = await supabase
        .from("team_plans")
        .select(
          "amount, currency, interval, allow_card_one_off, allow_card_recurring, allow_bank_transfer, bank_instructions"
        )
        .eq("team_id", teamId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (planErr) {
        setErr(planErr.message);
        setLoading(false);
        return;
      }

      setTeam(teamRow as Team);
      setPlan((planRow as Plan) ?? null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, teamId, supabase]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
          <p className="mt-3 text-sm font-medium text-gray-900">Loading settings…</p>
          <p className="mt-1 text-xs text-gray-700">Fetching team + plan details.</p>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-red-900">Error</p>
          <p className="mt-1 text-sm text-red-800 break-words">{err}</p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Go back
            </button>

            <button
              onClick={() => {
                router.replace("/dashboard");
                router.refresh();
              }}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Team not found</p>
          <p className="mt-1 text-sm text-gray-700">This team might have been deleted or you don’t have access.</p>
          <button
            onClick={() => {
              router.replace("/dashboard");
              router.refresh();
            }}
            className="mt-4 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return <SettingsClient team={team} plan={plan} />;
}
