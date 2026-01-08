import Stripe from 'stripe';
import supabase from '@/lib/supabase';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

function getOrigin(req: Request) {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
    }

    // NOTE: This should be manager-authenticated later.
    // For now, we take teamId from the request body.
    const body = await req.json().catch(() => null);
    const teamId = String(body?.teamId ?? '');
    if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 });

    // Load team
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, name, stripe_account_id')
      .eq('id', teamId)
      .single();

    if (teamErr) throw teamErr;

    let stripeAccountId: string | null = team.stripe_account_id;

    // Create connected account if needed
    if (!stripeAccountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        metadata: { team_id: team.id },
      });

      stripeAccountId = acct.id;

      const { error: updErr } = await supabase
        .from('teams')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', team.id);

      if (updErr) throw updErr;
    }

    // Create onboarding link
    const origin = getOrigin(req);

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: 'account_onboarding',
      refresh_url: `${origin}/manager/billing?stripe=refresh`,
      return_url: `${origin}/manager/billing?stripe=return`,
    });

    return NextResponse.json({ url: link.url, stripe_account_id: stripeAccountId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to start Stripe onboarding.' },
      { status: 500 }
    );
  }
}
