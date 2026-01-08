import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, name, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json(
        { error: "Team not found", details: teamErr?.message },
        { status: 404 }
      );
    }

    const accountId = (team.stripe_account_id as string | null) ?? null;
    if (!accountId) {
      return NextResponse.json({
        teamId,
        teamName: team.name,
        stripe_account_id: null,
        connected: false,
      });
    }

    const acct = await stripe.accounts.retrieve(accountId);

    const charges_enabled = Boolean(acct.charges_enabled);
    const card_payments =
      typeof acct.capabilities?.card_payments === "string"
        ? acct.capabilities.card_payments
        : "unknown";

    const transfers =
      typeof acct.capabilities?.transfers === "string"
        ? acct.capabilities.transfers
        : "unknown";

    const currently_due = acct.requirements?.currently_due ?? [];
    const past_due = acct.requirements?.past_due ?? [];
    const eventually_due = acct.requirements?.eventually_due ?? [];

    // Persist the two fields your join page uses
    await supabaseAdmin
      .from("teams")
      .update({
        stripe_charges_enabled: charges_enabled,
        stripe_card_payments: card_payments,
      })
      .eq("id", teamId);

    return NextResponse.json({
      teamId,
      teamName: team.name,
      stripe_account_id: accountId,
      connected: true,
      charges_enabled,
      card_payments,
      transfers,
      requirements: {
        currently_due,
        past_due,
        eventually_due,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", details: String(err) },
      { status: 500 }
    );
  }
}
