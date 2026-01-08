import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { data: link, error: linkErr } = await supabaseAdmin
    .from("payment_links")
    .select("team_id, amount, currency, interval, billing_type, active, max_uses, uses")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });
  if (!link || !link.active) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  if (link.uses >= link.max_uses) return NextResponse.json({ error: "This link has already been used" }, { status: 400 });

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, stripe_account_id, stripe_charges_enabled, stripe_card_payments")
    .eq("id", link.team_id)
    .single();

  if (teamErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    amount: link.amount,
    currency: link.currency,
    interval: link.interval,
    billing_type: link.billing_type, // one_off | subscription
    stripe_ready:
      Boolean(team.stripe_account_id) &&
      Boolean(team.stripe_charges_enabled) &&
      String(team.stripe_card_payments).toLowerCase() === "active",
  });
}
