export const dynamic = "force-dynamic";

import PaymentButton from "./PaymentButton";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function PaymentPage({
  params,
}: {
  params: { membershipId: string };
}) {
  const membershipId = String(params?.membershipId || "").trim();

  if (!membershipId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Invalid</h1>
          <p className="text-gray-600">Missing membership ID.</p>
        </div>
      </div>
    );
  }

  // 1) Membership (only fields we need)
  const { data: membership, error: memErr } = await supabaseAdmin
    .from("memberships")
    .select("id, team_id, player_id, status, next_due_at, custom_amount_gbp")
    .eq("id", membershipId)
    .maybeSingle();

  if (memErr || !membership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Invalid</h1>
          <p className="text-gray-600">This payment link is not valid.</p>
          <p className="text-xs text-gray-400 mt-2">ID: {membershipId}</p>
        </div>
      </div>
    );
  }

  // 2) Player (public-safe)
  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, name, email, phone")
    .eq("id", membership.player_id)
    .maybeSingle();

  // 3) Team (public-safe + stripe readiness)
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name, stripe_charges_enabled, stripe_card_payments")
    .eq("id", membership.team_id)
    .maybeSingle();

  if (!player || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">Unable to load payment information.</p>
        </div>
      </div>
    );
  }

  const stripeReady =
    Boolean(team.stripe_charges_enabled) &&
    String(team.stripe_card_payments || "").toLowerCase() === "active";

  // 4) Active plan (default amount)
  const { data: plan } = await supabaseAdmin
    .from("team_plans")
    .select("amount")
    .eq("team_id", membership.team_id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planAmountGBP =
    plan?.amount != null ? Number(plan.amount) / 100 : 5;

  const amountGBP =
    membership.custom_amount_gbp != null
      ? Number(membership.custom_amount_gbp)
      : planAmountGBP;

  const dueDate = membership.next_due_at ? new Date(membership.next_due_at) : null;
  const today = new Date();
  const isOverdue = dueDate ? dueDate.getTime() < today.getTime() : false;

  const daysUntilDue =
    dueDate
      ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{team.name}</h1>
          <p className="text-sm text-gray-600">Payment link for an existing player</p>
        </div>

        {!stripeReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <p className="text-amber-800 text-sm">
              This team hasn’t finished payment setup yet. Please try again later.
            </p>
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 text-sm">Player:</span>
            <span className="font-semibold text-gray-900 text-sm">{player.name}</span>
          </div>

          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 text-sm">Amount:</span>
            <span className="font-semibold text-gray-900 text-sm">£{amountGBP.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Due date:</span>
            <span className={`font-semibold text-sm ${isOverdue ? "text-red-600" : "text-gray-900"}`}>
              {dueDate ? dueDate.toLocaleDateString("en-GB") : "Soon"}
              {isOverdue ? " (Overdue)" : ""}
            </span>
          </div>
        </div>

        {isOverdue && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
            <p className="text-red-800 text-sm">
              ⚠️ Your payment is overdue. Please pay as soon as possible to stay active.
            </p>
          </div>
        )}

        {!isOverdue && daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5">
            <p className="text-yellow-800 text-sm">
              ⏰ Payment due in {daysUntilDue} {daysUntilDue === 1 ? "day" : "days"}
            </p>
          </div>
        )}

        <PaymentButton
          membershipId={membership.id}
          teamId={membership.team_id}
          amount={amountGBP}
          defaultName={player.name}
          defaultEmail={player.email}
          defaultPhone={player.phone}
          stripeReady={stripeReady}
        />

        <p className="text-xs text-gray-500 text-center mt-4">
          Secure payment processed by Stripe
        </p>
      </div>
    </div>
  );
}
