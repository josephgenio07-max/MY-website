import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toE164UK } from "../../../../lib/phone";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Interval = "week" | "month" | "quarter";
type BillingType = "subscription" | "one_off";

type Team = {
  id: string;
  name: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_card_payments: string | null;
};

type Plan = {
  amount: number;
  currency: string;
  interval: Interval;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function isStripeReady(team: Team) {
  return (
    !!team.stripe_account_id &&
    !!team.stripe_charges_enabled &&
    String(team.stripe_card_payments || "").toLowerCase() === "active"
  );
}

async function loadTeam(teamId: string) {
  const { data: team, error } = await supabaseAdmin
    .from("teams")
    .select("id, name, stripe_account_id, stripe_charges_enabled, stripe_card_payments")
    .eq("id", teamId)
    .single();

  if (error || !team) throw new Error("Team not found");
  return team as Team;
}

async function loadActivePlan(teamId: string) {
  const { data: plan, error } = await supabaseAdmin
    .from("team_plans")
    .select("amount, currency, interval")
    .eq("team_id", teamId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !plan) throw new Error("No active payment plan found");
  return plan as Plan;
}

async function upsertPlayer(teamId: string, name: string, email: string, phoneRaw: string, phoneE164: string) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("players")
    .select("id, name, phone, phone_e164")
    .eq("team_id", teamId)
    .eq("email", email)
    .maybeSingle();

  if (findErr) throw new Error("Player lookup failed");

  if (existing?.id) {
    const playerId = existing.id as string;

    const updates: any = {};
    if (existing.name !== name) updates.name = name;
    if ((existing.phone ?? "") !== phoneRaw) updates.phone = phoneRaw;
    if ((existing.phone_e164 ?? "") !== phoneE164) updates.phone_e164 = phoneE164;
    updates.reminder_consent = true;

    const { error: updErr } = await supabaseAdmin.from("players").update(updates).eq("id", playerId);
    if (updErr) throw new Error("Player update failed");

    return playerId;
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("players")
    .insert({
      team_id: teamId,
      name,
      email,
      phone: phoneRaw,
      phone_e164: phoneE164,
      reminder_consent: true,
    })
    .select("id")
    .single();

  if (insErr || !created) throw new Error("Failed to create player");
  return created.id as string;
}

async function findOrCreateMembership(teamId: string, playerId: string, planInterval: Interval, billingType: BillingType) {
  const { data: existing, error } = await supabaseAdmin
    .from("memberships")
    .select("id, billing_type")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error("Membership lookup failed");

  if (existing?.id) return existing.id as string;

  const { data: created, error: insErr } = await supabaseAdmin
    .from("memberships")
    .insert({
      team_id: teamId,
      player_id: playerId,
      plan_interval: planInterval,
      billing_type: billingType,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !created) throw new Error("Failed to create membership");
  return created.id as string;
}

function stripeRecurringFor(interval: Interval) {
  // Stripe doesn't support "quarter" directly
  if (interval === "quarter") return { interval: "month" as const, interval_count: 3 };
  return { interval: interval as "week" | "month" };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phoneRaw = String(body?.phone || "").trim();

    if (!name || !email) return bad("Missing required fields (name, email)");

    const phoneE164 = toE164UK(phoneRaw);
    if (!phoneE164) return bad("Enter a valid UK phone number (e.g. +44...).");

    const origin = req.headers.get("origin") || "http://localhost:3000";

    // -------------------------------------------------------
    // C) MEMBERSHIP CHECKOUT (used by reminders: /pay/:id)
    // -------------------------------------------------------
    if (body?.source === "membership") {
      const membershipId = String(body?.membershipId || "").trim();
      const mode = String(body?.mode || "one_off") as "one_off" | "subscription";

      if (!membershipId) return bad("Missing membershipId");
      if (!["one_off", "subscription"].includes(mode)) return bad("Invalid mode");

      // Load membership -> team + player
      const { data: m, error: mErr } = await supabaseAdmin
        .from("memberships")
        .select("id, team_id, player_id, custom_amount_gbp")
        .eq("id", membershipId)
        .maybeSingle();

      if (mErr || !m) return bad("Membership not found", 404);

      const team = await loadTeam(m.team_id);
      if (!isStripeReady(team)) return bad("Card payments are not enabled for this team yet.");

      const plan = await loadActivePlan(m.team_id);

      // Always attach payment to existing player/membership (no duplicates)
      const playerId = m.player_id as string;

      const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
        mode === "subscription" ? "subscription" : "payment";

      // Amount:
      // - subscription uses plan amount
      // - one_off uses custom_amount_gbp if set, else plan amount
      const oneOffAmountCents = m.custom_amount_gbp != null
        ? Math.round(Number(m.custom_amount_gbp) * 100)
        : Number(plan.amount);

      const unitAmount = stripeMode === "subscription" ? Number(plan.amount) : oneOffAmountCents;

      const recurring = stripeMode === "subscription" ? stripeRecurringFor(plan.interval) : undefined;

      const session = await stripe.checkout.sessions.create(
        {
          mode: stripeMode,
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: plan.currency,
                unit_amount: unitAmount,
                product_data: {
                  name:
                    stripeMode === "subscription"
                      ? `${team.name} - ${plan.interval} membership`
                      : `${team.name} - payment`,
                  description: `Payment for ${team.name}`,
                },
                ...(recurring ? { recurring } : {}),
              },
              quantity: 1,
            },
          ],
          success_url: `${origin}/pay/success?membershipId=${membershipId}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/pay/${membershipId}`,
          metadata: {
            source: "membership",
            team_id: team.id,
            player_id: playerId,
            membership_id: membershipId,
            billing_type: stripeMode === "subscription" ? "subscription" : "one_off",
            plan_interval: plan.interval,
            phone_e164: phoneE164,
          },
        },
        { stripeAccount: team.stripe_account_id! }
      );

      if (!session.url) return bad("Stripe session created but no URL returned", 500);

      // record pending payment
      const { error: payErr } = await supabaseAdmin.from("payments").insert({
        team_id: team.id,
        player_id: playerId,
        membership_id: membershipId,
        amount: unitAmount,
        currency: plan.currency,
        interval: plan.interval,
        provider: "stripe",
        stripe_session_id: session.id,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      if (payErr) return bad("Failed to record pending payment", 500);

      return NextResponse.json({ url: session.url });
    }

    // -------------------------------------------------------
    // B) TEAM PAYMENT LINK CHECKOUT (/pay/team/[token])
    // -------------------------------------------------------
    if (body?.source === "team_payment_link") {
      const token = String(body?.token || "").trim();
      const mode = String(body?.mode || "").trim() as "one_off" | "subscription";
      const amountCents = body?.amountCents;

      if (!token) return bad("Missing token");
      if (!["one_off", "subscription"].includes(mode)) return bad("Invalid mode");

      const { data: link, error: linkErr } = await supabaseAdmin
        .from("payment_links")
        .select("team_id, active, allow_one_off, allow_subscription, allow_custom_amount, min_amount_gbp, max_amount_gbp")
        .eq("token", token)
        .maybeSingle();

      if (linkErr) return bad("Payment link lookup failed", 500);
      if (!link || !link.active) return bad("Invalid or expired payment link", 400);

      const allowOneOff = link.allow_one_off ?? true;
      const allowSub = link.allow_subscription ?? true;
      const allowCustom = link.allow_custom_amount ?? true;
      const minGBP = link.min_amount_gbp != null ? Number(link.min_amount_gbp) : 1;
      const maxGBP = link.max_amount_gbp != null ? Number(link.max_amount_gbp) : 200;

      if (mode === "one_off" && !allowOneOff) return bad("One-off payments are disabled.");
      if (mode === "subscription" && !allowSub) return bad("Subscriptions are disabled.");

      const team = await loadTeam(link.team_id);
      if (!isStripeReady(team)) return bad("Card payments are not enabled for this team yet.");

      const plan = await loadActivePlan(link.team_id);

      // Upsert player + membership so dashboard + reminders work later
      const playerId = await upsertPlayer(team.id, name, email, phoneRaw, phoneE164);
      const billingType: BillingType = mode === "subscription" ? "subscription" : "one_off";
      const membershipId = await findOrCreateMembership(team.id, playerId, plan.interval, billingType);

      const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
        mode === "subscription" ? "subscription" : "payment";

      let unitAmount: number;

      if (stripeMode === "subscription") {
        unitAmount = Number(plan.amount);
      } else {
        const cents = Number(amountCents);
        if (!Number.isFinite(cents) || cents <= 0) return bad("Invalid amountCents");
        if (!allowCustom) {
          unitAmount = Number(plan.amount);
        } else {
          const gbp = cents / 100;
          if (gbp < minGBP || gbp > maxGBP) return bad(`Amount must be between £${minGBP} and £${maxGBP}.`);
          unitAmount = Math.round(cents);
        }
      }

      const recurring = stripeMode === "subscription" ? stripeRecurringFor(plan.interval) : undefined;

      const session = await stripe.checkout.sessions.create(
        {
          mode: stripeMode,
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: plan.currency,
                unit_amount: unitAmount,
                product_data: {
                  name:
                    stripeMode === "subscription"
                      ? `${team.name} - ${plan.interval} membership`
                      : `${team.name} - one-off payment`,
                  description: `Payment for ${team.name}`,
                },
                ...(recurring ? { recurring } : {}),
              },
              quantity: 1,
            },
          ],
          success_url: `${origin}/pay/team/success?teamId=${team.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/pay/team/${token}`,
          metadata: {
            source: "team_payment_link",
            payment_link_token: token,
            team_id: team.id,
            player_id: playerId,
            membership_id: membershipId,
            billing_type: billingType,
            plan_interval: plan.interval,
            phone_e164: phoneE164,
          },
        },
        { stripeAccount: team.stripe_account_id! }
      );

      if (!session.url) return bad("Stripe session created but no URL returned", 500);

      const { error: payErr } = await supabaseAdmin.from("payments").insert({
        team_id: team.id,
        player_id: playerId,
        membership_id: membershipId,
        amount: unitAmount,
        currency: plan.currency,
        interval: plan.interval,
        provider: "stripe",
        stripe_session_id: session.id,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      if (payErr) return bad("Failed to record pending payment", 500);

      return NextResponse.json({ url: session.url });
    }

    // -------------------------------------------------------
    // A) JOIN LINK CHECKOUT (your original)
    // -------------------------------------------------------
    const joinToken = String(body?.token || "").trim();
    const method = String(body?.method || "").trim() as "card" | "recurring";
    if (!joinToken || !["card", "recurring"].includes(method)) {
      return bad("Missing required fields (token, method)");
    }

    const { data: joinLink, error: joinErr } = await supabaseAdmin
      .from("join_links")
      .select("team_id, active")
      .eq("token", joinToken)
      .maybeSingle();

    if (joinErr) return bad("Join link lookup failed", 500);
    if (!joinLink || !joinLink.active) return bad("Invalid or expired join link");

    const team = await loadTeam(joinLink.team_id);
    if (!isStripeReady(team)) return bad("Card payments are not enabled for this team yet.");

    const plan = await loadActivePlan(team.id);

    const playerId = await upsertPlayer(team.id, name, email, phoneRaw, phoneE164);

    const billingType: BillingType = method === "recurring" ? "subscription" : "one_off";
    const membershipId = await findOrCreateMembership(team.id, playerId, plan.interval, billingType);

    const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
      method === "recurring" ? "subscription" : "payment";

    const recurring = stripeMode === "subscription" ? stripeRecurringFor(plan.interval) : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: stripeMode,
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: plan.currency,
              unit_amount: Number(plan.amount),
              product_data: {
                name: `${team.name} - ${plan.interval} membership`,
                description: `Payment for ${team.name}`,
              },
              ...(recurring ? { recurring } : {}),
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/join/success?teamId=${team.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/join/${joinToken}`,
        metadata: {
          source: "join",
          team_id: team.id,
          player_id: playerId,
          membership_id: membershipId,
          billing_type: billingType,
          plan_interval: plan.interval,
          phone_e164: phoneE164,
          join_token: joinToken,
        },
      },
      { stripeAccount: team.stripe_account_id! }
    );

    if (!session.url) return bad("Stripe session created but no URL returned", 500);

    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      team_id: team.id,
      player_id: playerId,
      membership_id: membershipId,
      amount: Number(plan.amount),
      currency: plan.currency,
      interval: plan.interval,
      provider: "stripe",
      stripe_session_id: session.id,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (payErr) return bad("Failed to record pending payment", 500);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Payment processing failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}
