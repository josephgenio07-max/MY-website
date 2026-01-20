"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function cleanName(name: string) {
  return (name || "").trim().replace(/\s+/g, " ");
}

async function requireManager() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return { supabase, userId: data.user.id };
}

async function assertTeamOwned(supabase: any, userId: string, teamId: string) {
  const { data, error } = await supabase
    .from("teams")
    .select("id, manager_id")
    .eq("id", teamId)
    .single();

  if (error || !data) throw new Error("Team not found");
  if (data.manager_id !== userId) throw new Error("Forbidden");
}

export async function renameTeam(teamId: string, name: string) {
  const { supabase, userId } = await requireManager();
  await assertTeamOwned(supabase, userId, teamId);

  const nextName = cleanName(name);
  if (nextName.length < 2) throw new Error("Team name too short");
  if (nextName.length > 60) throw new Error("Team name too long");

  const { error } = await supabase.from("teams").update({ name: nextName }).eq("id", teamId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}

export async function archiveTeam(teamId: string) {
  const { supabase, userId } = await requireManager();
  await assertTeamOwned(supabase, userId, teamId);

  const { error } = await supabase
    .from("teams")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", teamId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}

export async function restoreTeam(teamId: string) {
  const { supabase, userId } = await requireManager();
  await assertTeamOwned(supabase, userId, teamId);

  const { error } = await supabase.from("teams").update({ archived_at: null }).eq("id", teamId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}

export async function deleteTeam(teamId: string) {
  const { supabase, userId } = await requireManager();
  await assertTeamOwned(supabase, userId, teamId);

  // Block if any payment history exists for this team
  const { data: paymentsForTeam, error: paymentsForTeamErr } = await supabase
    .from("payments")
    .select("id, memberships!inner(team_id)")
    .eq("memberships.team_id", teamId)
    .limit(1);

  if (paymentsForTeamErr) throw new Error(paymentsForTeamErr.message);
  if (paymentsForTeam && paymentsForTeam.length > 0) {
    throw new Error("Cannot delete: team has payment history. Archive it instead.");
  }

  // Block if any memberships exist
  const { count: membershipCount, error: mErr } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (mErr) throw new Error(mErr.message);
  if ((membershipCount ?? 0) > 0) {
    throw new Error("Cannot delete: team still has players. Remove them first.");
  }

  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}
