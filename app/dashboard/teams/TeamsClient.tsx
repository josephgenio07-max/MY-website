"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

import { renameTeam, archiveTeam, restoreTeam, deleteTeam } from "./actions";

type TeamRow = {
  id: string;
  name: string;
  created_at: string;
  archived_at: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TeamsClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const returnTo = (sp.get("returnTo") || "/dashboard").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [pending, startTransition] = useTransition();

  async function load() {
    setError(null);
    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.replace("/auth/login");
      return;
    }

    const q = supabase
      .from("teams")
      .select("id, name, created_at, archived_at")
      .eq("manager_id", u.user.id)
      .order("created_at", { ascending: false });

    const { data, error } = showArchived ? await q : await q.is("archived_at", null);

    if (error) {
      setError(error.message);
      setTeams([]);
      setLoading(false);
      return;
    }

    setTeams((data ?? []) as TeamRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  function openRename(t: TeamRow) {
    setRenamingId(t.id);
    setRenameValue(t.name);
  }

  function closeRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  function doRename(teamId: string) {
    const next = renameValue.trim();
    if (!next) {
      setError("Team name cannot be empty.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await renameTeam(teamId, next);
        closeRename();
        await load();
      } catch (e: any) {
        setError(e?.message || "Rename failed.");
      }
    });
  }

  function doArchive(teamId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await archiveTeam(teamId);
        await load();
      } catch (e: any) {
        setError(e?.message || "Archive failed.");
      }
    });
  }

  function doRestore(teamId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await restoreTeam(teamId);
        await load();
      } catch (e: any) {
        setError(e?.message || "Restore failed.");
      }
    });
  }

  function doDelete(teamId: string) {
    // last-ditch safety: make them confirm
    const ok = window.confirm(
      "Delete this team permanently?\n\nThis is blocked if there are players or any payment history."
    );
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteTeam(teamId);
        await load();
      } catch (e: any) {
        setError(e?.message || "Delete failed.");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
          <p className="mt-3 text-sm text-gray-600">Loading teams…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage teams</h1>
              <p className="text-sm text-gray-600">Rename, archive, restore or delete teams.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(returnTo)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Back
              </button>

              <button
                onClick={() => setShowArchived((v) => !v)}
                className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm border border-gray-100">
            <p className="text-gray-700 font-semibold">No teams found</p>
            <p className="mt-1 text-sm text-gray-500">
              {showArchived ? "No archived teams." : "Create a team from the dashboard."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {teams.map((t) => {
                const isArchived = Boolean(t.archived_at);

                return (
                  <div key={t.id} className="p-4 sm:p-5 hover:bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-semibold text-gray-900 truncate">{t.name}</p>
                          {isArchived && (
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              Archived
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-gray-500">
                          Created: {fmtDate(t.created_at)} • Archived: {fmtDate(t.archived_at)}
                        </p>

                        <p className="mt-1 text-[11px] text-gray-400 break-all">{t.id}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openRename(t)}
                          disabled={pending}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Rename
                        </button>

                        {!isArchived ? (
                          <button
                            onClick={() => doArchive(t.id)}
                            disabled={pending}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            onClick={() => doRestore(t.id)}
                            disabled={pending}
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        )}

                        <button
                          onClick={() => doDelete(t.id)}
                          disabled={pending}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Rename modal */}
      {renamingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-gray-900">Rename team</p>
                <p className="text-sm text-gray-600">Keep it short and recognizable.</p>
              </div>
              <button
                onClick={closeRename}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="block text-sm font-medium text-gray-700">Team name</label>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="e.g. Sunday Ballers"
              />

              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                <button
                  onClick={closeRename}
                  disabled={pending}
                  className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => doRename(renamingId)}
                  disabled={pending}
                  className="w-full sm:w-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
