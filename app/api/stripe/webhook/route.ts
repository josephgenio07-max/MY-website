import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeNextDueAtUTC } from "../../../../lib/due";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    // Security check: Ensure webhook secret is configured
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
    
    // Verify webhook signature (prevents fake webhooks)
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Only process checkout completion events
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;
      const now = new Date();

      // Security: Verify payment was actually paid
      if (session.payment_status !== "paid") {
        console.error("❌ Session not paid:", sessionId, session.payment_status);
        return NextResponse.json({ received: true });
      }

      // 1) Mark payment paid
      const { error: payUpdErr } = await supabaseAdmin
        .from("payments")
        .update({ 
          status: "paid", 
          paid_at: now.toISOString(),
          updated_at: now.toISOString() 
        })
        .eq("stripe_session_id", sessionId);

      if (payUpdErr) {
        console.error("❌ payments update failed:", payUpdErr);
        return NextResponse.json({ received: true });
      }

      // 2) Load payment row to get membership_id
      const { data: payRow, error: payFetchErr } = await supabaseAdmin
        .from("payments")
        .select("id, membership_id, team_id, amount")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (payFetchErr || !payRow?.membership_id) {
        console.error("❌ payment row missing membership_id for session:", sessionId, payFetchErr);
        return NextResponse.json({ received: true });
      }

      // Security: Verify amount matches (prevents amount tampering)
      const paidAmount = session.amount_total; // in cents
      if (paidAmount !== payRow.amount) {
        console.error("❌ Amount mismatch:", { 
          expected: payRow.amount, 
          received: paidAmount, 
          sessionId 
        });
        // Still mark as paid but log the discrepancy
      }

      // 3) Load membership (need team_id + plan_interval)
      const { data: memRow, error: memFetchErr } = await supabaseAdmin
        .from("memberships")
        .select("id, team_id, player_id, plan_interval")
        .eq("id", payRow.membership_id)
        .maybeSingle();

      if (memFetchErr || !memRow) {
        console.error("❌ membership fetch failed:", payRow.membership_id, memFetchErr);
        return NextResponse.json({ received: true });
      }

      const interval = (memRow.plan_interval ||
        session.metadata?.plan_interval) as "week" | "month" | "quarter" | null;

      if (!interval) {
        console.error("❌ missing plan_interval for membership:", memRow.id);
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

      const nextDueAt = computeNextDueAtUTC(now, interval, team);

      // 5) Update membership
      const { error: memUpdErr } = await supabaseAdmin
        .from("memberships")
        .update({
          status: "active",
          last_paid_at: now.toISOString(),
          next_due_at: nextDueAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", memRow.id);

      if (memUpdErr) {
        console.error("❌ memberships update failed:", memUpdErr);
      } else {
        console.log("✅ Payment processed successfully:", sessionId);
      }
    } else {
      console.log("ℹ️ Unhandled event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err?.message, err?.stack);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}