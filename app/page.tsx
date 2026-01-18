"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      try {
        const { data, error } = await supabaseBrowser().auth.getUser();

        if (!alive) return;

        if (error) {
          router.replace("/auth/login");
          router.refresh();
          return;
        }

        if (data.user) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          router.replace("/auth/login");
          router.refresh();
        }
      } catch {
        if (!alive) return;
        router.replace("/auth/login");
        router.refresh();
      }
    }

    checkAuth();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent" />
        <p className="mt-3 text-sm font-medium text-gray-800">Loading…</p>
      </div>
    </div>
  );
}
