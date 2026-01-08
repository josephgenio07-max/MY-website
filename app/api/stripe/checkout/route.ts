import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ✅ use the same relative import style that worked for phone
import { toE164UK } from "../../../../lib/phone";

export const runtime = "nodejs";

// ✅ remove fake apiVersion
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type CheckoutRequest = {
  token: string;
  name: string;
  email: string;
  phone?: string;
  method: "card" | "recurring";
};

type Team = {
  id: string;
  name: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_card_payments: string | null;

  due_weekday: number | null;
  due_day_of_month: number | null;
  due_month_in_quarter: number | null;
};

type Plan = {
  amount: number;
  currency: string;
  interval: "week" | "month" | "quarter";
  active: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutRequest;
    const { token, name, email, phone, method } = body;

    if (!token || !name?.trim() || !email?.trim() || !method) {
      return NextResponse.json(
        { error: "Missing required fields (token, name, email, method)" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhoneRaw = phone?.trim() || "";

    // ✅ require phone for reminders, store E.164
    const phone_e164 = toE164UK(trimmedPhoneRaw);
    if (!phone_e164) {
      return NextResponse.json(
        { error: "Enter a valid UK phone number (e.g. +44...)." },
        { status: 400 }
      );
    }

    // 1) Validate join link → get teamId
    const { data: joinLink, error: joinErr } = await supabaseAdmin
      .from("join_links")
      .select("team_id, active")
      .eq("token", token)
      .maybeSingle();

    if (joinErr) {
      return NextResponse.json(
        { error: "Join link lookup failed", details: joinErr },
        { status: 500 }
      );
    }
    if (!joinLink || !joinLink.active) {
      return NextResponse.json({ error: "Invalid or expired join link" }, { status: 400 });
    }

    const teamId = joinLink.team_id as string;

    // 2) Load team (include due schedule fields for future use/debug)
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select(
        "id, name, stripe_account_id, stripe_charges_enabled, stripe_card_payments, due_weekday, due_day_of_month, due_month_in_quarter"
      )
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json({ error: "Team not found", details: teamErr }, { status: 404 });
    }

    const typedTeam = team as Team;

    if (!typedTeam.stripe_account_id) {
      return NextResponse.json({ error: "Manager hasn't connected Stripe yet." }, { status: 400 });
    }

    if (
      !typedTeam.stripe_charges_enabled ||
      String(typedTeam.stripe_card_payments).toLowerCase() !== "active"
    ) {
      return NextResponse.json({ error: "Card payments are not enabled for this team yet." }, { status: 400 });
    }

    // 3) Load active plan (week/month/quarter)
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("team_plans")
      .select("amount, currency, interval, active")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr || !plan) {
      return NextResponse.json({ error: "No active payment plan found", details: planErr }, { status: 400 });
    }

    const typedPlan = plan as Plan;

    // 4) Upsert player (✅ store phone_e164)
    const { data: existing, error: findPlayerErr } = await supabaseAdmin
      .from("players")
      .select("id, name, phone, phone_e164")
      .eq("team_id", teamId)
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (findPlayerErr) {
      return NextResponse.json({ error: "Player lookup failed", details: findPlayerErr }, { status: 500 });
    }

    let playerId: string;

    if (existing?.id) {
      playerId = existing.id as string;

      const updates: {
        name?: string;
        phone?: string | null;
        phone_e164?: string | null;
        reminder_consent?: boolean;
      } = {};

      if (existing.name !== trimmedName) updates.name = trimmedName;
      if ((existing.phone ?? "") !== trimmedPhoneRaw) updates.phone = trimmedPhoneRaw;
      if ((existing.phone_e164 ?? "") !== phone_e164) updates.phone_e164 = phone_e164;
      updates.reminder_consent = true;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabaseAdmin.from("players").update(updates).eq("id", playerId);
        if (updErr) {
          return NextResponse.json({ error: "Player update failed", details: updErr }, { status: 500 });
        }
      }
    } else {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("players")
        .insert({
          team_id: teamId,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhoneRaw,
          phone_e164,
          reminder_consent: true,
        })
        .select("id")
        .single();

      if (insErr || !created) {
        return NextResponse.json(
          { error: "Failed to create player record", message: insErr?.message ?? "Unknown", details: insErr ?? null },
          { status: 500 }
        );
      }

      playerId = created.id as string;
    }

    // 5) Find or create membership
    const { data: existingMembership, error: mFindErr } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (mFindErr) {
      return NextResponse.json({ error: "Membership lookup failed", details: mFindErr }, { status: 500 });
    }

    const billingType = method === "recurring" ? "subscription" : "one_off";
    let membershipId: string;

    if (existingMembership?.id) {
      membershipId = existingMembership.id as string;
    } else {
      const { data: newMembership, error: membershipErr } = await supabaseAdmin
        .from("memberships")
        .insert({
          team_id: teamId,
          player_id: playerId,
          plan_interval: typedPlan.interval,
          billing_type: billingType,
          status: "pending",
        })
        .select("id")
        .single();

      if (membershipErr || !newMembership) {
        return NextResponse.json({ error: "Failed to create membership", details: membershipErr }, { status: 500 });
      }

      membershipId = newMembership.id as string;
    }

    // 6) Create Stripe Checkout Session
    const origin = req.headers.get("origin") || "http://localhost:3000";
    const mode: Stripe.Checkout.SessionCreateParams.Mode =
      method === "recurring" ? "subscription" : "payment";

    // ✅ Stripe recurring DOES NOT support "quarter".
    // ✅ Quarter subscription = interval month + interval_count 3
    const stripeRecurring: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring | undefined =
      method === "recurring"
        ? typedPlan.interval === "quarter"
          ? { interval: "month", interval_count: 3 }
          : { interval: typedPlan.interval } // week | month
        : undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      customer_email: trimmedEmail,
      line_items: [
        {
          price_data: {
            currency: typedPlan.currency,
            unit_amount: typedPlan.amount,
            product_data: {
              name: `${typedTeam.name} - ${typedPlan.interval} membership`,
              description: `Payment for ${typedTeam.name}`,
            },
            ...(stripeRecurring ? { recurring: stripeRecurring } : {}),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/join/success?teamId=${teamId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/join/${token}`,
      metadata: {
        team_id: teamId,
        player_id: playerId,
        membership_id: membershipId,
        billing_type: billingType,
        plan_interval: typedPlan.interval,
        phone_e164,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams, {
      stripeAccount: typedTeam.stripe_account_id,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe session created but no URL returned" }, { status: 500 });
    }

    // 7) Record pending payment
    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      team_id: teamId,
      player_id: playerId,
      membership_id: membershipId,
      amount: typedPlan.amount,
      currency: typedPlan.currency,
      interval: typedPlan.interval,
      provider: "stripe",
      stripe_session_id: session.id,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (payErr) {
      return NextResponse.json({ error: "Failed to record pending payment", details: payErr }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Payment processing failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}
