import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  console.log("✅ HIT /api/stripe/connect/create");

  try {
    const body = await req.json();
    const teamId = body?.teamId;

    console.log("teamId:", teamId);

    if (!teamId || typeof teamId !== "string") {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json(
        { error: "Team not found", details: teamErr?.message ?? null },
        { status: 404 }
      );
    }

    let accountId = (team.stripe_account_id as string | null) ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { teamId },
      });

      accountId = account.id;

      const { error: updateErr } = await supabaseAdmin
        .from("teams")
        .update({ stripe_account_id: accountId })
        .eq("id", teamId);

      if (updateErr) {
        return NextResponse.json(
          { error: "Failed to update team", details: updateErr.message },
          { status: 500 }
        );
      }
    }

    // We want to return manager to DASHBOARD after onboarding
    const origin = req.headers.get("origin") ?? "http://localhost:3000";

    const returnUrl = `${origin}/dashboard?teamId=${teamId}&connect=return`;
    const refreshUrl = `${origin}/dashboard?teamId=${teamId}&connect=refresh`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return NextResponse.json({
      accountId,
      url: accountLink.url,
      debug_teamId: teamId,
      debug_return_url: returnUrl,
      debug_refresh_url: refreshUrl,
    });
  } catch (err: any) {
    console.error("❌ ERROR in /api/stripe/connect/create:", err);

    // ALWAYS return JSON so the client doesn’t show null
    return NextResponse.json(
      { error: "Unexpected error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
