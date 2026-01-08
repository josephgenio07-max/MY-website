"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      
      if (data.user) {
        router.replace("/dashboard");
      } else {
        router.replace("/auth/login");
      }
    }
    
    checkAuth();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
        <p className="mt-3 text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}