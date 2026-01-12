"use server";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover",
});

// Admin client bypasses RLS (server-side only)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "http://localhost:3000";

export async function createRepeatPaymentCheckout(
  membershipId: string,
  teamId: string,
  amount: number
) {
  try {
    // 1) Get team Stripe account (must exist)
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("id, name, stripe_account_id")
      .eq("id", teamId)
      .single();

    if (teamError || !team?.stripe_account_id) {
      return { error: "Team payment setup incomplete" };
    }

    // 2) Validate membership belongs to team & get player
    const { data: membership, error: memError } = await supabaseAdmin
      .from("memberships")
      .select("id, team_id, player_id, players (id, name, email)")
      .eq("id", membershipId)
      .single();

    if (memError || !membership) return { error: "Membership not found" };
    if (membership.team_id !== teamId) return { error: "Invalid membership/team" };

    const player = Array.isArray((membership as any).players)
      ? (membership as any).players[0]
      : (membership as any).players;

    if (!player?.email) return { error: "Player email missing" };

    const amt = Math.max(1, Number(amount) || 5);

    // 3) Create Stripe Checkout on the connected account
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: `${team.name} - Payment`,
                description: "Team membership payment",
              },
              unit_amount: Math.round(amt * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${SITE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&membership_id=${membershipId}`,
        cancel_url: `${SITE_URL}/pay/${membershipId}?cancelled=true`,
        customer_email: player.email,
        metadata: {
          membership_id: membershipId,
          team_id: teamId,
          player_id: membership.player_id,
          payment_type: "repeat",
        },
      },
      { stripeAccount: team.stripe_account_id }
    );

    return { url: session.url };
  } catch (error) {
    console.error("Error creating checkout:", error);
    return { error: "Failed to create payment session" };
  }
}
