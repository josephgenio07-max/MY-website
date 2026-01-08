import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token")?.trim() ?? "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: link, error: linkErr } = await supabase
      .from("join_links")
      .select("team_id, active")
      .eq("token", token)
      .eq("active", true)
      .maybeSingle();

    if (linkErr) {
      console.error("Join link query error:", linkErr);
      return NextResponse.json({ error: "Failed to load join link" }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: "Invalid or expired join link" }, { status: 404 });
    }

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, name, stripe_account_id, stripe_charges_enabled")
      .eq("id", link.team_id)
      .single();

    if (teamErr || !team) {
      console.error("Team query error:", teamErr);
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { data: plan, error: planErr } = await supabase
      .from("team_plans")
      .select("amount, currency, interval, methods_enabled, bank_instructions, active")
      .eq("team_id", team.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr || !plan) {
      console.error("Plan query error:", planErr);
      return NextResponse.json({ error: "No active plan found" }, { status: 400 });
    }

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      methods_enabled: plan.methods_enabled || [],
      bank_instructions: plan.bank_instructions,
      stripe_ready: !!team.stripe_account_id && !!team.stripe_charges_enabled,
    });
  } catch (err: any) {
    console.error("Join token API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}