import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  await supabaseAdmin
    .from("memberships")
    .update({ status: "due", updated_at: now.toISOString() })
    .lt("next_due_at", now.toISOString())
    .in("status", ["active"]);

  const overdue = new Date(now);
  overdue.setDate(overdue.getDate() - 7);

  await supabaseAdmin
    .from("memberships")
    .update({ status: "overdue", updated_at: now.toISOString() })
    .lt("next_due_at", overdue.toISOString())
    .in("status", ["due"]);

  return NextResponse.json({ ok: true });
}