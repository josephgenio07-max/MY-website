import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("join_links")
    .select("token, active, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    supabaseUrl: url,
    hasServiceRole,
    joinLinks: data || null,
    error: error?.message || null,
  });
}
