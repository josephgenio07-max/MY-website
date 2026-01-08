"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

export default function NotificationsBell({ userId }: { userId: string }) {
  const [unread, setUnread] = useState<number>(0);

  async function refreshUnread() {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("manager_id", userId)
      .is("read_at", null);

    setUnread(count ?? 0);
  }

  useEffect(() => {
    refreshUnread();

    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `manager_id=eq.${userId}`,
        },
        refreshUnread
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `manager_id=eq.${userId}`,
        },
        refreshUnread
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <span>🔔</span>
      <span>Notifications</span>
      {unread > 0 && (
        <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
