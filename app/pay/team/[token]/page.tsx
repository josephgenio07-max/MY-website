export const dynamic = "force-dynamic";

import PayTeamClient from "./PayTeamClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = { params: Promise<{ token: string }> };

function toYMD(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  try {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export default async function Page({ params }: PageProps) {
  const { token: raw } = await params;
  const token = (raw || "").trim();
  if (!token) return <PayTeamClient notFound />;

  // IMPORTANT: select manager-config fields
  const { data: link, error: linkErr } = await supabaseAdmin
    .from("payment_links")
    .select("team_id, active, amount_gbp, due_date, billing_type, interval")
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link || !link.active) return <PayTeamClient notFound />;

  // Validate link config (manager must have set amount + billing)
  const amountGBP = link.amount_gbp != null ? Number(link.amount_gbp) : null;
  const billingType =
    link.billing_type && ["one_off", "subscription"].includes(String(link.billing_type))
      ? (String(link.billing_type) as "one_off" | "subscription")
      : null;

  const interval =
    link.interval && ["week", "month", "quarter"].includes(String(link.interval))
      ? (String(link.interval) as "week" | "month" | "quarter")
      : null;

  if (!amountGBP || !Number.isFinite(amountGBP) || amountGBP <= 0) return <PayTeamClient notFound />;
  if (!billingType) return <PayTeamClient notFound />;
  if (billingType === "subscription" && !interval) return <PayTeamClient notFound />;

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name, stripe_charges_enabled, stripe_card_payments")
    .eq("id", link.team_id)
    .maybeSingle();

  const stripeReady =
    Boolean(team?.stripe_charges_enabled) &&
    String(team?.stripe_card_payments || "").toLowerCase() === "active";

  return (
    <PayTeamClient
      token={token}
      team={{
        id: team?.id || link.team_id,
        name: team?.name ?? "Team",
        stripeReady,
      }}
      link={{
        amountGBP,
        dueDate: toYMD(link.due_date),
        billingType,
        interval,
      }}
    />
  );
}
