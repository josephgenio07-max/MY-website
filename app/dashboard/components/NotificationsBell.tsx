"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [unread, setUnread] = useState(0);

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
  }, []);

  return (
    <button
      type="button"
      onClick={() => router.push("/notifications")}
      className="relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm z-10"
    >
      <span>🔔</span>
      <span>Notifications</span>

      {unread > 0 && (
        <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
          {unread}
        </span>
      )}
    </button>
  );
}
