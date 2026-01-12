import { createClient } from "@supabase/supabase-js";
import PaymentButton from "./PaymentButton";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = await params;

  const { data: membership, error: memErr } = await supabaseAdmin
    .from("memberships")
    .select("*")
    .eq("id", membershipId)
    .single();

  if (memErr || !membership) {
    console.error("Membership not found:", memErr);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Link Invalid
          </h1>
          <p className="text-gray-600">This payment link is not valid.</p>
          <p className="text-xs text-gray-400 mt-2">ID: {membershipId}</p>
        </div>
      </div>
    );
  }

  const { data: player, error: playerErr } = await supabaseAdmin
    .from("players")
    .select("*")
    .eq("id", membership.player_id)
    .single();

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", membership.team_id)
    .single();

  if (playerErr || teamErr || !player || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">Unable to load payment information.</p>
        </div>
      </div>
    );
  }

  const dueDate = membership.next_due_date ? new Date(membership.next_due_date) : null;
  const today = new Date();

  const isOverdue = dueDate ? dueDate < today : false;
  const daysUntilDue =
    dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

const amount = Number(
  membership.custom_amount_gbp ?? team.weekly_amount ?? 5
);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{team.name}</h1>
          <p className="text-gray-600">Payment Due</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">Player:</span>
            <span className="font-semibold text-gray-900">{player.name}</span>
          </div>

          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">Amount:</span>
            <span className="font-semibold text-gray-900">£{amount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600">Due Date:</span>
            <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-gray-900"}`}>
              {dueDate ? dueDate.toLocaleDateString("en-GB") : "Soon"}
              {isOverdue && " (Overdue)"}
            </span>
          </div>
        </div>

        {isOverdue && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              ⚠️ Your payment is overdue. Please pay as soon as possible to stay active.
            </p>
          </div>
        )}

        {!isOverdue && daysUntilDue !== null && daysUntilDue <= 3 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              ⏰ Payment due in {daysUntilDue} {daysUntilDue === 1 ? "day" : "days"}
            </p>
          </div>
        )}

        <PaymentButton
  membershipId={membership.id}
  teamId={membership.team_id}
  amount={amount}
/>

        <p className="text-xs text-gray-500 text-center mt-4">
          Secure payment processed by Stripe
        </p>
      </div>
    </div>
  );
}
