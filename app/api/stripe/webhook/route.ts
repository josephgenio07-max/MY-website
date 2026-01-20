import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeNextDueAtUTC } from "../../../../lib/due";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function parseDueDateFromMeta(v: string | undefined | null): Date | null {
  const s = (v || "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseBoolMeta(v: string | undefined | null): boolean | null {
  const s = (v || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

export async function POST(req: Request) {
  try {
    if (!webhookSecret) {
      console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      console.error("❌ Missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const sessionId = session.id;
    const now = new Date();

    if (session.payment_status !== "paid") {
      console.log("ℹ️ Session not paid:", sessionId, session.payment_status);
      return NextResponse.json({ received: true });
    }

    // 1) Mark payment paid
    const { error: payUpdErr } = await supabaseAdmin
      .from("payments")
      .update({
        status: "paid",
        paid_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("stripe_session_id", sessionId);

    if (payUpdErr) {
      console.error("❌ payments update failed:", payUpdErr);
      return NextResponse.json({ received: true });
    }

    // 2) Load payment row
    const { data: payRow, error: payFetchErr } = await supabaseAdmin
      .from("payments")
      .select("id, membership_id, team_id, amount")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (payFetchErr || !payRow?.membership_id) {
      console.error("❌ payment row missing membership_id for session:", sessionId, payFetchErr);
      return NextResponse.json({ received: true });
    }

    // amount_total can be null for subscription checkout sessions
    const paidAmount = session.amount_total;
    if (typeof paidAmount === "number" && paidAmount !== payRow.amount) {
      console.error("❌ Amount mismatch:", {
        expected: payRow.amount,
        received: paidAmount,
        sessionId,
      });
    }

    // 3) Load membership
    const { data: memRow, error: memFetchErr } = await supabaseAdmin
      .from("memberships")
      .select("id, team_id, player_id, plan_interval")
      .eq("id", payRow.membership_id)
      .maybeSingle();

    if (memFetchErr || !memRow) {
      console.error("❌ membership fetch failed:", payRow.membership_id, memFetchErr);
      return NextResponse.json({ received: true });
    }

    // 4) Load team due schedule
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("due_weekday, due_day_of_month, due_month_in_quarter")
      .eq("id", memRow.team_id)
      .single();

    if (teamErr || !team) {
      console.error("❌ team due settings missing:", memRow.team_id, teamErr);
      return NextResponse.json({ received: true });
    }

    // interval (with override support)
    const intervalOverride = (session.metadata?.interval_override || "").trim();
    const intervalFromMeta = (session.metadata?.plan_interval || "").trim();

    const interval =
      (["week", "month", "quarter"].includes(intervalOverride) ? intervalOverride : "") ||
      (["week", "month", "quarter"].includes(intervalFromMeta) ? intervalFromMeta : "") ||
      (memRow.plan_interval || "");

    if (!interval || !["week", "month", "quarter"].includes(interval)) {
      console.error("❌ missing/invalid plan_interval for membership:", memRow.id, {
        intervalOverride,
        intervalFromMeta,
        memPlan: memRow.plan_interval,
      });
      return NextResponse.json({ received: true });
    }

    // due date override (manager-set)
    const dueOverride = parseDueDateFromMeta(session.metadata?.due_date);
    let nextDueAt = computeNextDueAtUTC(now, interval as any, team);

    if (dueOverride && dueOverride > now) {
      nextDueAt = dueOverride;
    }

    // custom amount override (manager-set)
    const customAmountGBPStr = (session.metadata?.custom_amount_gbp || "").trim();
    const customAmountGBP = customAmountGBPStr ? Number(customAmountGBPStr) : null;

    const billingType = (session.metadata?.billing_type || "").trim(); // "one_off" | "subscription"

    // ✅ consent from metadata (if present)
    const consentMeta = parseBoolMeta(session.metadata?.reminder_consent);

    // 5) Update membership
    const updates: any = {
      status: "active",
      last_paid_at: now.toISOString(),
      next_due_at: nextDueAt.toISOString(),
      updated_at: now.toISOString(),
    };

    if (billingType === "one_off" || billingType === "subscription") {
      updates.billing_type = billingType;
    }

    if (intervalOverride && ["week", "month", "quarter"].includes(intervalOverride)) {
      updates.plan_interval = intervalOverride;
    }

    if (customAmountGBP != null && Number.isFinite(customAmountGBP) && customAmountGBP > 0) {
      updates.custom_amount_gbp = Number(customAmountGBP.toFixed(2));
    }

    const { error: memUpdErr } = await supabaseAdmin
      .from("memberships")
      .update(updates)
      .eq("id", memRow.id);

    if (memUpdErr) {
      console.error("❌ memberships update failed:", memUpdErr);
    }

    // ✅ 6) Update player consent (so checkbox is real, not vibes)
    if (consentMeta !== null) {
      const { error: pErr } = await supabaseAdmin
        .from("players")
        .update({ reminder_consent: consentMeta })
        .eq("id", memRow.player_id);

      if (pErr) {
        console.error("❌ player consent update failed:", pErr);
      }
    }

    console.log("✅ Payment processed successfully:", sessionId);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err?.message, err?.stack);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
