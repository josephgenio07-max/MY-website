import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const teamId = String(body?.teamId ?? "");
    const managerId = String(body?.managerId ?? "");

    if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    if (!managerId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // ✅ Load team + verify ownership
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, manager_id, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.manager_id !== managerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let accountId = (team.stripe_account_id as string | null) ?? null;

    // ✅ Only create a Stripe account if none exists for THIS team
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { teamId, managerId },
      });

      accountId = account.id;

      const { error: updateErr } = await supabaseAdmin
        .from("teams")
        .update({
          stripe_account_id: accountId,
          stripe_charges_enabled: null,
          stripe_card_payments: null,
        })
        .eq("id", teamId);

      if (updateErr) {
        return NextResponse.json({ error: "Failed to update team", details: updateErr.message }, { status: 500 });
      }
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    const returnUrl = `${origin}/dashboard?teamId=${teamId}&connect=return`;
    const refreshUrl = `${origin}/dashboard?teamId=${teamId}&connect=refresh`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (err: any) {
    return NextResponse.json({ error: "Unexpected error", details: err?.message ?? String(err) }, { status: 500 });
  }
}
