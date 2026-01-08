"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type NotificationItem = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning" | "error";
  is_read: boolean;
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function levelStyles(level: NotificationItem["level"]) {
  switch (level) {
    case "success":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "error":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

export default function NotificationsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  async function loadNotifications() {
    if (!userId) return;
    
    setBusy(true);
    setError(null);

    try {
      const { data: rows, error: rowsErr } = await supabase
        .from("notifications")
        .select("id, created_at, title, body, level, is_read")
        .eq("manager_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (rowsErr) {
        setItems([]);
        setError("Failed to load notifications.");
        return;
      }

      if (!rows || rows.length === 0) {
        setItems([]);
        setError("No notifications yet.");
        return;
      }

      setItems(
        rows.map((r: any) => ({
          id: String(r.id),
          created_at: String(r.created_at),
          title: String(r.title ?? "Notification"),
          body: String(r.body ?? ""),
          level: (r.level as NotificationItem["level"]) ?? "info",
          is_read: Boolean(r.is_read),
        }))
      );

      // Mark all as read
      const unreadIds = rows.filter((r: any) => !r.is_read).map((r: any) => r.id);
      if (unreadIds.length > 0) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .in("id", unreadIds);
      }
    } finally {
      setBusy(false);
    }
  }

  async function markAllAsRead() {
    if (!userId) return;
    
    setBusy(true);
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("manager_id", userId)
      .eq("is_read", false);
    
    await loadNotifications();
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      if (mounted) {
        setUserId(data.user.id);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (userId) {
      loadNotifications();
      setLoading(false);
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
          <p className="mt-3 text-sm text-gray-600">Loading notifications…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                <p className="text-sm text-gray-500">Activity and updates</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={markAllAsRead}
                disabled={busy || items.length === 0}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Mark all read
              </button>
              <button
                onClick={loadNotifications}
                disabled={busy}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-2xl bg-white p-16 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Nothing yet</h2>
            <p className="mt-2 text-gray-600">
              Notifications will appear when you send reminders or record payments.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`p-6 hover:bg-gray-50 ${!n.is_read ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        {!n.is_read && (
                          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      {n.body && <p className="mt-1 text-sm text-gray-600">{n.body}</p>}
                      <p className="mt-2 text-xs text-gray-500">
                        {formatDateTime(n.created_at)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${levelStyles(
                        n.level
                      )}`}
                    >
                      {n.level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}