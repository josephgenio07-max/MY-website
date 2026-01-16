export const dynamic = "force-dynamic";

import PayTeamClient from "./PayTeamClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = { params: { token: string } };

export default async function Page({ params }: PageProps) {
  const token = (params?.token || "").trim();
  if (!token) return <PayTeamClient notFound />;

  // 1) Resolve payment link
  const { data: link, error: linkErr } = await supabaseAdmin
    .from("payment_links")
    .select(
      "team_id, active, allow_one_off, allow_subscription, allow_custom_amount, default_amount_gbp, min_amount_gbp, max_amount_gbp"
    )
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link || !link.active) return <PayTeamClient notFound />;

  // 2) Load team (public-safe fields)
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name, stripe_charges_enabled, stripe_card_payments")
    .eq("id", link.team_id)
    .maybeSingle();

  // If team is missing, still allow page to render with a fallback name
  const teamName = team?.name ?? "Team";
  const stripeReady =
    Boolean(team?.stripe_charges_enabled) &&
    String(team?.stripe_card_payments || "").toLowerCase() === "active";

  // 3) Load active plan (needed for subscription option)
  const { data: plan } = await supabaseAdmin
    .from("team_plans")
    .select("amount, currency, interval")
    .eq("team_id", link.team_id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <PayTeamClient
      token={token}
      team={{
        id: team?.id || link.team_id,
        name: teamName,
        stripeReady,
      }}
      link={{
        allowOneOff: link.allow_one_off ?? true,
        allowSubscription: link.allow_subscription ?? true,
        allowCustomAmount: link.allow_custom_amount ?? true,
        defaultAmountGBP:
          link.default_amount_gbp != null ? Number(link.default_amount_gbp) : null,
        minAmountGBP: link.min_amount_gbp != null ? Number(link.min_amount_gbp) : 1,
        maxAmountGBP: link.max_amount_gbp != null ? Number(link.max_amount_gbp) : 200,
      }}
      plan={
        plan
          ? {
              amountCents: Number(plan.amount),
              currency: String(plan.currency || "gbp"),
              interval: String(plan.interval || "month"),
            }
          : null
      }
    />
  );
}
