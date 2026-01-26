import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBaseUrl(req: Request) {
  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    // 0) Env sanity (prevents “crash before try/catch”)
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.error("Missing STRIPE_SECRET_KEY");
      return NextResponse.json(
        { error: "Server misconfigured: STRIPE_SECRET_KEY missing" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(key);

    // 1) Body
    const body = await req.json().catch(() => ({} as any));
    const teamId = String(body?.teamId ?? "").trim();

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    // 2) Auth (must come from cookies/session, not client-provided ids)
    const supabase = await createSupabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = userData.user;
    const managerId = user.id;
    const managerEmail = user.email ?? undefined;

    // 3) Verify team ownership (use admin to avoid RLS surprises)
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

    // 4) Create connected account only if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",

        // 🔥 KEY CHANGE:
        // If you pass email, Stripe often nudges them to SIGN IN if that email exists.
        // If you want it to feel like “create a new account”, omit email.
        // You can switch this back on later if you prefer prefill convenience.
        // email: managerEmail,

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
        console.error("Failed to update team with stripe_account_id:", updateErr);
        return NextResponse.json(
          { error: "Failed to update team", details: updateErr.message },
          { status: 500 }
        );
      }
    }

    // 5) Create onboarding link
    const base = getBaseUrl(req);
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
    console.error("STRIPE_CONNECT_CREATE_ERROR:", err);

    // Stripe errors are super informative; surface safe parts in dev
    const details =
      err?.raw?.message ||
      err?.message ||
      (typeof err === "string" ? err : "Unknown error");

    return NextResponse.json(
      {
        error: "Unexpected error",
        details,
        type: err?.type,
        code: err?.code,
      },
      { status: 500 }
    );
  }
}
