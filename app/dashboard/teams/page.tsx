"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  archived_at: string | null;
  created_at?: string | null;
};

type TeamMeta = {
  playersCount: number;
  paymentsCount: number;
  canDelete: boolean;
};

function formatShortDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TeamsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = (sp.get("returnTo") || "/settings").trim();

  const [teams, setTeams] = useState<Team[]>([]);
  const [meta, setMeta] = useState<Record<string, TeamMeta>>({});
  const [err, setErr] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data.user) {
      router.replace("/auth/login");
      return null;
    }
    return data.user;
  }

  async function getPlayersCount(teamId: string) {
    const { count, error } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (error) return 999999;
    return count ?? 0;
  }

  async function getPaymentsCount(teamId: string) {
    const { count, error } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (error) return 999999;
    return count ?? 0;
  }

  async function load() {
    setErr(null);

    const user = await requireUser();
    if (!user) return;

    const q = supabase
      .from("teams")
      .select("id, name, archived_at, created_at")
      .eq("manager_id", user.id)
      .order("created_at", { ascending: false });

    if (!showArchived) q.is("archived_at", null);

    const { data: rows, error } = await q;
    if (error) {
      setErr(error.message);
      setTeams([]);
      setMeta({});
      return;
    }

    const list = (rows ?? []) as Team[];
    setTeams(list);

    // NOTE: This is N+1. Works for now, but if you have many teams, switch to a single RPC later.
    const metaEntries: Array<[string, TeamMeta]> = [];
    for (const t of list) {
      const playersCount = await getPlayersCount(t.id);
      const paymentsCount = await getPaymentsCount(t.id);
      metaEntries.push([
        t.id,
        { playersCount, paymentsCount, canDelete: playersCount === 0 && paymentsCount === 0 },
      ]);
    }
    setMeta(Object.fromEntries(metaEntries));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function toggleArchive(team: Team) {
    setBusyId(team.id);
    setErr(null);

    const next = team.archived_at ? null : new Date().toISOString();
    const { error } = await supabase.from("teams").update({ archived_at: next }).eq("id", team.id);

    if (error) setErr(error.message);
    await load();
    setBusyId(null);
  }

  function startRename(team: Team) {
    setEditingId(team.id);
    setDraftName(team.name);
  }

  function cancelRename() {
    setEditingId(null);
    setDraftName("");
  }

  async function saveRename(teamId: string) {
    const name = draftName.trim().replace(/\s+/g, " ");
    if (name.length < 2) return setErr("Team name too short.");
    if (name.length > 60) return setErr("Team name too long.");

    setBusyId(teamId);
    setErr(null);

    const { error } = await supabase.from("teams").update({ name }).eq("id", teamId);
    if (error) setErr(error.message);

    setEditingId(null);
    setDraftName("");
    await load();
    setBusyId(null);
  }

  async function deleteTeam(team: Team) {
    const m = meta[team.id];
    if (!m?.canDelete) {
      setErr("Delete disabled: team must have 0 players and 0 payments. Archive instead.");
      return;
    }

    const typed = prompt(`This permanently deletes "${team.name}".\nType DELETE to confirm:`);
    if (typed !== "DELETE") return;

    setBusyId(team.id);
    setErr(null);

    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) setErr(error.message);

    await load();
    setBusyId(null);
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Manage Teams</h1>
              <p className="mt-1 text-sm text-gray-600">
                Archive hides teams from your dashboard. Delete is only allowed if a team has 0 players and 0 payments.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </button>

              <button
                onClick={() => router.push(returnTo)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        </div>

        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          {teams.length === 0 ? (
            <div className="p-10 text-center text-gray-600">No teams found.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {teams.map((t) => {
                const isBusy = busyId === t.id;
                const isEditing = editingId === t.id;
                const m = meta[t.id];

                return (
                  <li key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {!isEditing ? (
                          <div className="font-medium text-gray-900 truncate">
                            {t.name} {t.archived_at ? <span className="text-xs text-gray-500">(Archived)</span> : null}
                          </div>
                        ) : (
                          <input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            disabled={isBusy}
                            className="w-full sm:w-64 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        )}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Players: <span className="text-gray-900 font-medium">{m ? m.playersCount : "…"}</span> ·
                        Payments: <span className="text-gray-900 font-medium">{m ? m.paymentsCount : "…"}</span> ·
                        Created: <span className="text-gray-900 font-medium">{formatShortDate(t.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push(`/dashboard?teamId=${t.id}`)}
                        className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                      >
                        Open
                      </button>

                      {!isEditing ? (
                        <button
                          onClick={() => startRename(t)}
                          disabled={isBusy}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Rename
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => saveRename(t.id)}
                            disabled={isBusy}
                            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelRename}
                            disabled={isBusy}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      <button
                        disabled={isBusy}
                        onClick={() => toggleArchive(t)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {t.archived_at ? "Unarchive" : "Archive"}
                      </button>

                      <button
                        disabled={isBusy || !m?.canDelete}
                        onClick={() => deleteTeam(t)}
                        title={
                          !m
                            ? "Checking delete rules…"
                            : m.playersCount > 0
                            ? "Delete disabled: remove players first"
                            : m.paymentsCount > 0
                            ? "Delete disabled: payment history exists (archive instead)"
                            : "Delete team"
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          m?.canDelete
                            ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                            : "border-gray-200 bg-white text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
