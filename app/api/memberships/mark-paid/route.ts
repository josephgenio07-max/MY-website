import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Body = {
  membershipId: string;
  amount: number;
  currency: string;
  interval: "month" | "year" | "one_off";
  paymentMethod: "bank_transfer" | "manual";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { membershipId, amount, currency, interval, paymentMethod } = body;

    if (!membershipId || !amount || !currency || !interval || !paymentMethod) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: membership, error: mErr } = await supabaseAdmin
      .from("memberships")
      .select("id, team_id, player_id, plan_interval")
      .eq("id", membershipId)
      .single();

    if (mErr || !membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    const start = new Date();
    const end = new Date(start);
    const planInterval = (membership.plan_interval as "month" | "year") ?? "month";
    if (planInterval === "month") end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);

    // Update membership
    await supabaseAdmin
      .from("memberships")
      .update({
        billing_type: paymentMethod,
        status: "active",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        next_due_at: end.toISOString(),
        last_paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    // Insert payment record
    await supabaseAdmin.from("payments").insert({
      team_id: membership.team_id,
      player_id: membership.player_id,
      membership_id: membershipId,
      amount,
      currency,
      interval: interval === "one_off" ? "one_off" : planInterval,
      provider: paymentMethod,
      status: "paid",
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
