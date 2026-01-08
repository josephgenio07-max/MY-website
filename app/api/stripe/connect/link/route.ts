import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  console.log("✅ HIT /api/stripe/connect/link");

  try {
    let body: any = null;

    // Robust JSON parsing (avoids silent failures)
    try {
      body = await req.json();
    } catch (e) {
      console.log("❌ Failed to parse JSON body");
      return NextResponse.json(
        { error: "Invalid JSON body. Expected { teamId: string }" },
        { status: 400 }
      );
    }

    const teamId = body?.teamId;
    console.log("teamId:", teamId);

    if (!teamId || typeof teamId !== "string") {
      return NextResponse.json(
        { error: "teamId is required and must be a string" },
        { status: 400 }
      );
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, name, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      console.log("❌ Team not found:", teamErr?.message);
      return NextResponse.json(
        { error: "Team not found", details: teamErr?.message },
        { status: 404 }
      );
    }

    const accountId = (team.stripe_account_id as string | null) ?? null;
    console.log("accountId:", accountId);

    if (!accountId) {
      return NextResponse.json(
        { error: "No connected Stripe account on this team yet" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    console.log("origin:", origin);

    // Use account_update for existing accounts with missing requirements
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_update",
      refresh_url: `${origin}/team/${teamId}/billing?connect=refresh`,
      return_url: `${origin}/team/${teamId}/billing?connect=return`,
    });

    console.log("✅ Created Stripe account update link");

    return NextResponse.json({
      ok: true,
      url: accountLink.url,
      accountId,
      teamId,
      teamName: team.name,
      debug_return_url: `${origin}/team/${teamId}/billing?connect=return`,
      debug_refresh_url: `${origin}/team/${teamId}/billing?connect=refresh`,
    });
  } catch (err: any) {
    console.log("❌ ERROR /api/stripe/connect/link:", err);
    return NextResponse.json(
      { error: "Unexpected error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
