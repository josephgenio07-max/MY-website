"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import SettingsClient from "./settingsClient";

export default function TeamSettingsPage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [team, setTeam] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      const { data: teamRow, error: teamErr } = await supabase
        .from("teams")
        .select("id, name, expected_players, due_interval, due_weekday, due_day, due_quarter_month")
        .eq("id", teamId)
        .single();

      if (teamErr) {
        setErr(teamErr.message);
        setLoading(false);
        return;
      }

      const { data: planRow } = await supabase
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

      setTeam(teamRow);
      setPlan(planRow ?? null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, teamId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-gray-600">Loading settings...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 border border-gray-100">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="mt-1 text-sm text-red-700">{err}</p>
        </div>
      </div>
    );
  }

  return <SettingsClient team={team} plan={plan} />;
}
