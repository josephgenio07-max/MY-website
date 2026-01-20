import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const teamId = String(body?.teamId ?? "").trim();

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    // ✅ Auth: derive manager from session cookies (NOT from request body)
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const managerId = user.id;
    const managerEmail = user.email ?? undefined;

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
        country: "GB",
        email: managerEmail,
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
        return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
      }
    }

    const base =
      (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "") ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    const returnUrl = `${base}/dashboard?teamId=${teamId}&connect=return`;
    const refreshUrl = `${base}/dashboard?teamId=${teamId}&connect=refresh`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
