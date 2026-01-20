import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

function makeToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString("base64url").slice(0, len);
}

function getBaseUrl() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("Missing NEXT_PUBLIC_BASE_URL env var.");
  return base;
}

function isValidYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
    if (!authData.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId || "").trim();
    if (!teamId) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });

    // REQUIRED manager config
    const amountRaw = String(body?.amount_gbp ?? "").trim();
    if (!amountRaw) return NextResponse.json({ error: "Amount is required" }, { status: 400 });

    const amountGBP = Number(Number(amountRaw).toFixed(2));
    if (!Number.isFinite(amountGBP) || amountGBP <= 0) {
      return NextResponse.json({ error: "Invalid amount_gbp" }, { status: 400 });
    }
    if (amountGBP < 1 || amountGBP > 200) {
      return NextResponse.json({ error: "Amount must be between £1 and £200" }, { status: 400 });
    }

    // Optional due date (YYYY-MM-DD)
    const dueDate = body?.due_date ? String(body.due_date).trim() : null;
    if (dueDate && (!isValidYYYYMMDD(dueDate))) {
      return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
    }

    // Billing type (default one_off)
    const billingType = body?.billing_type ? String(body.billing_type).trim() : "one_off";
    if (!["one_off", "subscription"].includes(billingType)) {
      return NextResponse.json({ error: "Invalid billing_type" }, { status: 400 });
    }

    // Interval required for subscription
    const interval = body?.interval ? String(body.interval).trim() : null;
    if (billingType === "subscription") {
      if (!interval || !["week", "month", "quarter"].includes(interval)) {
        return NextResponse.json({ error: "Interval is required for subscription (week|month|quarter)" }, { status: 400 });
      }
    }

    // Verify manager owns team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, manager_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 400 });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (team.manager_id !== authData.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const token = makeToken(24);
    const baseUrl = getBaseUrl();

    // LOCKED link: player cannot edit amount
    const payload: any = {
      team_id: teamId,
      token,
      active: true,
      created_by: authData.user.id,
      title: `Player payment link`,

      // lock the amount at DB level
      allow_one_off: billingType === "one_off",
      allow_subscription: billingType === "subscription",
      allow_custom_amount: false,
      default_amount_gbp: amountGBP,
      min_amount_gbp: amountGBP,
      max_amount_gbp: amountGBP,

      // manager config
      amount_gbp: amountGBP,
      due_date: dueDate,
      billing_type: billingType,
      interval: billingType === "subscription" ? interval : null,
    };

    const { error: insErr } = await supabaseAdmin.from("payment_links").insert(payload);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ token, url: `${baseUrl}/pay/team/${token}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
