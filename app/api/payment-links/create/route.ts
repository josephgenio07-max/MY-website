import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function makeToken(len = 40) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type Interval = "week" | "month" | "quarter";
type BillingType = "one_off" | "subscription";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await req.json();
    const teamId = String(body.teamId || "").trim();
    const amountCents = Number(body.amountCents);
    const billingType = body.billingType as BillingType;
    const interval = body.interval as Interval;
    const dueAt = body.dueAt ? String(body.dueAt) : null;

    if (!teamId) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    if (!["one_off", "subscription"].includes(billingType))
      return NextResponse.json({ error: "Invalid billing type" }, { status: 400 });
    if (!["week", "month", "quarter"].includes(interval))
      return NextResponse.json({ error: "Invalid interval" }, { status: 400 });

    // verify manager owns team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, manager_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (team.manager_id !== data.user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // use plan currency as default
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("team_plans")
      .select("interval, currency")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr || !plan?.currency) {
      return NextResponse.json({ error: planErr?.message || "Active plan not found" }, { status: 400 });
    }

    const token = makeToken(40);

    const { error: insErr } = await supabaseAdmin.from("payment_links").insert({
      team_id: teamId,
      token,
      amount: amountCents,
      currency: plan.currency ?? "gbp",
      interval: plan.interval ?? "month", // plan
      interval_override: interval, // manager choice (requires column)
      due_at: dueAt,               // manager choice (requires column)
      billing_type: billingType,
      active: true,
      max_uses: 1,
      uses: 0,
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
