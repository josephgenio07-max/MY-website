import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeMethods(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out = new Set<string>();

  for (const m of raw) {
    const key = String(m || "").trim().toLowerCase();
    if (!key) continue;

    // Accept existing keys
    if (key === "card_one_off" || key === "card_subscription" || key === "bank" || key === "bank_transfer") {
      out.add(key);
      continue;
    }

    // Map old/alternate names -> UI expected keys
    if (key === "stripe_one_time" || key === "card" || key === "one_off" || key === "one-time" || key === "one_time") {
      out.add("card_one_off");
      continue;
    }

    if (key === "stripe_recurring" || key === "subscription" || key === "recurring") {
      out.add("card_subscription");
      continue;
    }

    if (key === "banktransfer" || key === "bank-transfer") {
      out.add("bank_transfer");
      continue;
    }
  }

  return Array.from(out);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = (searchParams.get("token") || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Try with active filter, but fall back if column doesn't exist.
    let link: any = null;

    const withActive = await supabase
      .from("join_links")
      .select("team_id, active")
      .eq("token", token)
      .eq("active", true)
      .maybeSingle();

    if (withActive.error) {
      const msg = String(withActive.error.message || "");
      // If "active" column doesn't exist, retry without it.
      if (msg.toLowerCase().includes("column") && msg.toLowerCase().includes("active")) {
        const fallback = await supabase
          .from("join_links")
          .select("team_id")
          .eq("token", token)
          .maybeSingle();

        if (fallback.error) {
          console.error("Join link fallback query error:", fallback.error);
          return NextResponse.json({ error: "Failed to load join link" }, { status: 500 });
        }
        link = fallback.data;
      } else {
        console.error("Join link query error:", withActive.error);
        return NextResponse.json({ error: "Failed to load join link" }, { status: 500 });
      }
    } else {
      link = withActive.data;
    }

    if (!link?.team_id) {
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

    const methods_enabled = normalizeMethods(plan.methods_enabled);

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      methods_enabled,
      bank_instructions: plan.bank_instructions ?? null,
      stripe_ready: !!team.stripe_account_id && !!team.stripe_charges_enabled,
    });
  } catch (err: any) {
    console.error("Join token API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
