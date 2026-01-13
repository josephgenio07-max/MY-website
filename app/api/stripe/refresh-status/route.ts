import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const teamId = String(body?.teamId ?? "");
    if (!teamId) {
      return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!team.stripe_account_id) {
      return NextResponse.json({ error: "Stripe not connected" }, { status: 400 });
    }

    const acct = await stripe.accounts.retrieve(team.stripe_account_id);

    const chargesEnabled = Boolean(acct.charges_enabled);
    const cardPayments =
      typeof acct.capabilities?.card_payments === "string"
        ? acct.capabilities.card_payments
        : null;

    const { error: updErr } = await supabaseAdmin
      .from("teams")
      .update({
        stripe_charges_enabled: chargesEnabled,
        stripe_card_payments: cardPayments,
      })
      .eq("id", teamId);

    if (updErr) {
      return NextResponse.json(
        { error: "Failed to update team", details: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      stripe_charges_enabled: chargesEnabled,
      stripe_card_payments: cardPayments,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
