// app/api/stripe/checkout/route.ts
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
  amount: number; // cents
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

function stripeRecurringFor(interval: Interval) {
  // Stripe doesn't support "quarter" directly
  if (interval === "quarter") return { interval: "month" as const, interval_count: 3 };
  return { interval: interval as "week" | "month" };
}

function parseDueDateYYYYMMDD(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
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

/**
 * Consent is NOT theatre here:
 * - Player must tick checkbox on pay page
 * - We enforce it server-side
 * - We store exactly what they chose
 */
async function upsertPlayer(
  teamId: string,
  name: string,
  email: string,
  phoneRaw: string,
  phoneE164: string,
  reminderConsent: boolean
) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("players")
    .select("id, name, phone, phone_e164, reminder_consent")
    .eq("team_id", teamId)
    .eq("email", email)
    .maybeSingle();

  if (findErr) throw new Error("Player lookup failed");

  if (existing?.id) {
    const playerId = existing.id as string;

    const updates: any = {};
    if (String(existing.name ?? "") !== name) updates.name = name;
    if (String(existing.phone ?? "") !== phoneRaw) updates.phone = phoneRaw;
    if (String(existing.phone_e164 ?? "") !== phoneE164) updates.phone_e164 = phoneE164;

    // ✅ store what the player actually consented to
    updates.reminder_consent = reminderConsent;

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
      reminder_consent: reminderConsent, // ✅ store consent from checkbox
    })
    .select("id")
    .single();

  if (insErr || !created) throw new Error("Failed to create player");
  return created.id as string;
}

async function findOrCreateMembership(args: {
  teamId: string;
  playerId: string;
  planInterval: Interval;
  billingType: BillingType;
  customAmountGBP?: number | null; // manager-set amount
}) {
  const { teamId, playerId, planInterval, billingType, customAmountGBP } = args;

  const { data: existing, error } = await supabaseAdmin
    .from("memberships")
    .select("id")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error("Membership lookup failed");

  // If exists, we still align it to manager config (prevents weird state drift)
  if (existing?.id) {
    const membershipId = existing.id as string;

    const updates: any = {
      billing_type: billingType,
      plan_interval: planInterval,
    };

    if (customAmountGBP != null && Number.isFinite(customAmountGBP) && customAmountGBP > 0) {
      updates.custom_amount_gbp = Number(customAmountGBP.toFixed(2));
    }

    await supabaseAdmin.from("memberships").update(updates).eq("id", membershipId);

    return membershipId;
  }

  const insertRow: any = {
    team_id: teamId,
    player_id: playerId,
    plan_interval: planInterval,
    billing_type: billingType,
    status: "pending",
  };

  if (customAmountGBP != null && Number.isFinite(customAmountGBP) && customAmountGBP > 0) {
    insertRow.custom_amount_gbp = Number(customAmountGBP.toFixed(2));
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("memberships")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr || !created) throw new Error("Failed to create membership");
  return created.id as string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phoneRaw = String(body?.phone || "").trim();

    if (!name) return bad("Name is required.");
    if (!email) return bad("Email is required.");

    const phoneE164 = toE164UK(phoneRaw);
    if (!phoneE164) return bad("Enter a valid UK phone number (e.g. +44...).");

    // Use your configured base URL if present; fallback to request origin
    const origin =
      (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "") ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    // -------------------------------------------------------
    // C) MEMBERSHIP CHECKOUT (used by reminders: /pay/:id)
    // NOTE: This flow is for an existing membership (already in dashboard).
    // We DO NOT force consent checkbox here because the pay page may not include it.
    // -------------------------------------------------------
    if (body?.source === "membership") {
      const membershipId = String(body?.membershipId || "").trim();
      const mode = String(body?.mode || "one_off") as "one_off" | "subscription";

      if (!membershipId) return bad("Missing membershipId");
      if (!["one_off", "subscription"].includes(mode)) return bad("Invalid mode");

      const { data: m, error: mErr } = await supabaseAdmin
        .from("memberships")
        .select("id, team_id, player_id, custom_amount_gbp")
        .eq("id", membershipId)
        .maybeSingle();

      if (mErr || !m) return bad("Membership not found", 404);

      const team = await loadTeam(m.team_id);
      if (!isStripeReady(team)) return bad("Card payments are not enabled for this team yet.");

      const plan = await loadActivePlan(m.team_id);

      const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
        mode === "subscription" ? "subscription" : "payment";

      // one-off uses custom_amount_gbp if set, else team plan
      const oneOffAmountCents =
        m.custom_amount_gbp != null ? Math.round(Number(m.custom_amount_gbp) * 100) : Number(plan.amount);

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
            player_id: String(m.player_id),
            membership_id: membershipId,
            billing_type: stripeMode === "subscription" ? "subscription" : "one_off",
            plan_interval: plan.interval,
            phone_e164: phoneE164,
          },
        },
        { stripeAccount: team.stripe_account_id! }
      );

      if (!session.url) return bad("Stripe session created but no URL returned", 500);

      const { error: payErr } = await supabaseAdmin.from("payments").insert({
        team_id: team.id,
        player_id: m.player_id,
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
    // HARD ENFORCEMENT:
    // - amount comes ONLY from payment_links.amount_gbp
    // - billing_type comes ONLY from payment_links.billing_type
    // - interval comes from payment_links.interval (or plan interval as fallback)
    // - player MUST consent (server-enforced)
    // - any client-passed amount/mode is ignored
    // -------------------------------------------------------
    if (body?.source === "team_payment_link") {
      const token = String(body?.token || "").trim();
      if (!token) return bad("Missing token");

      const reminderConsent = Boolean(body?.reminder_consent);
      if (!reminderConsent) return bad("You must consent to reminders to continue.");

      const { data: link, error: linkErr } = await supabaseAdmin
        .from("payment_links")
        .select("team_id, active, amount_gbp, due_date, billing_type, interval")
        .eq("token", token)
        .maybeSingle();

      if (linkErr) return bad("Payment link lookup failed", 500);
      if (!link || !link.active) return bad("Invalid or expired payment link", 400);

      const amountGBP = link.amount_gbp != null ? Number(link.amount_gbp) : null;
      if (!amountGBP || !Number.isFinite(amountGBP) || amountGBP <= 0) {
        return bad("This link is missing a fixed amount. Ask the manager to create a new one.", 400);
      }

      const billingTypeRaw = String(link.billing_type || "").trim();
      if (!["one_off", "subscription"].includes(billingTypeRaw)) {
        return bad("This link is missing a billing type. Ask the manager to create a new one.", 400);
      }

      const billingType: BillingType = billingTypeRaw === "subscription" ? "subscription" : "one_off";

      const dueDateMeta = parseDueDateYYYYMMDD(link.due_date ? String(link.due_date) : "");

      const team = await loadTeam(link.team_id);
      if (!isStripeReady(team)) return bad("Card payments are not enabled for this team yet.");

      const plan = await loadActivePlan(link.team_id);

      const intervalOverrideRaw = String(link.interval || "").trim();
      const intervalOverride: Interval | null =
        (["week", "month", "quarter"].includes(intervalOverrideRaw) ? (intervalOverrideRaw as Interval) : null) || null;

      const effectiveInterval: Interval = intervalOverride ?? plan.interval;

      // Create/update player + membership so dashboard + reminders work later
      const playerId = await upsertPlayer(team.id, name, email, phoneRaw, phoneE164, reminderConsent);
      const membershipId = await findOrCreateMembership({
        teamId: team.id,
        playerId,
        planInterval: effectiveInterval,
        billingType,
        customAmountGBP: amountGBP,
      });

      const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
        billingType === "subscription" ? "subscription" : "payment";

      // Manager-set fixed amount ALWAYS wins
      const unitAmount = Math.round(amountGBP * 100);

      const recurring = stripeMode === "subscription" ? stripeRecurringFor(effectiveInterval) : undefined;

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
                      ? `${team.name} - ${effectiveInterval} membership`
                      : `${team.name} - payment`,
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
            plan_interval: plan.interval, // plan baseline
            phone_e164: phoneE164,

            // ✅ manager-enforced config (webhook persists these onto membership)
            custom_amount_gbp: String(amountGBP.toFixed(2)),
            due_date: dueDateMeta || "",
            interval_override: intervalOverride ? String(intervalOverride) : "",
            reminder_consent: reminderConsent ? "true" : "false",
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
        interval: effectiveInterval,
        provider: "stripe",
        stripe_session_id: session.id,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      if (payErr) return bad("Failed to record pending payment", 500);

      return NextResponse.json({ url: session.url });
    }

    // -------------------------------------------------------
    // A) JOIN LINK CHECKOUT (original join flow)
    // NOTE: If you add a consent checkbox on join page, pass reminder_consent and enforce here too.
    // For now we keep existing behaviour: join uses team plan amount.
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

    // If you want consent enforced on join too, set reminderConsent = Boolean(body?.reminder_consent) and require it.
    const playerId = await upsertPlayer(team.id, name, email, phoneRaw, phoneE164, true);

    const billingType: BillingType = method === "recurring" ? "subscription" : "one_off";
    const membershipId = await findOrCreateMembership({
      teamId: team.id,
      playerId,
      planInterval: plan.interval,
      billingType,
      customAmountGBP: null,
    });

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
      { error: err?.message ? String(err.message) : "Payment processing failed" },
      { status: 500 }
    );
  }
}
