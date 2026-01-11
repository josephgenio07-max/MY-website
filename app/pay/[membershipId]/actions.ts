// app/pay/[membershipId]/actions.ts

'use server';

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export async function createRepeatPaymentCheckout(
  membershipId: string,
  teamId: string,
  amount: number
) {
  try {
    const supabase = await createSupabaseServerClient();

    // Get team's Stripe account
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('stripe_account_id, name')
      .eq('id', teamId)
      .single();

    if (teamError || !team?.stripe_account_id) {
      return { error: 'Team payment setup incomplete' };
    }

    // Get membership and player details
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select(`
        *,
        players (*)
      `)
      .eq('id', membershipId)
      .single();

    if (membershipError || !membership) {
      return { error: 'Membership not found' };
    }

    const player = Array.isArray((membership as any).players)
      ? (membership as any).players[0]
      : (membership as any).players;

    if (!player) {
      return { error: 'Player not found' };
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: {
                name: `${team.name} - Payment`,
                description: 'Team membership payment',
              },
              unit_amount: Math.round(amount * 100), // Convert to pence
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&membership_id=${membershipId}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${membershipId}?cancelled=true`,
        customer_email: player.email,
        metadata: {
          membership_id: membershipId,
          team_id: teamId,
          player_id: membership.player_id,
          payment_type: 'repeat',
        },
      },
      {
        stripeAccount: team.stripe_account_id,
      }
    );

    return { url: session.url };
  } catch (error) {
    console.error('Error creating checkout:', error);
    return { error: 'Failed to create payment session' };
  }
}