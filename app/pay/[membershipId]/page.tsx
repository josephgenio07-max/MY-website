// app/pay/[membershipId]/page.tsx

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import PaymentButton from './PaymentButton';

export default async function PaymentPage({
  params,
}: {
  params: { membershipId: string };
}) {
  const supabase = await createSupabaseServerClient();

  // Get membership details
  const { data: membership, error } = await supabase
    .from('memberships')
    .select(`
      *,
      players (*),
      teams (*)
    `)
    .eq('id', params.membershipId)
    .single();

  if (error || !membership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Invalid</h1>
          <p className="text-gray-600">This payment link is not valid or has expired.</p>
        </div>
      </div>
    );
  }

  const player = Array.isArray((membership as any).players)
    ? (membership as any).players[0]
    : (membership as any).players;

  const team = Array.isArray((membership as any).teams)
    ? (membership as any).teams[0]
    : (membership as any).teams;

  if (!player || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">Unable to load payment information.</p>
        </div>
      </div>
    );
  }

  // Check if player is overdue or due soon
  const dueDate = new Date(membership.next_due_date);
  const today = new Date();
  const isOverdue = dueDate < today;
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {team.name}
          </h1>
          <p className="text-gray-600">Payment Due</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">Player:</span>
            <span className="font-semibold text-gray-900">{player.name}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">Amount:</span>
            <span className="font-semibold text-gray-900">
              £{(team.weekly_amount || 5).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Due Date:</span>
            <span className={`font-semibold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
              {dueDate.toLocaleDateString('en-GB')}
              {isOverdue && ' (Overdue)'}
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

        {!isOverdue && daysUntilDue <= 3 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              ⏰ Payment due in {daysUntilDue} {daysUntilDue === 1 ? 'day' : 'days'}
            </p>
          </div>
        )}

        <PaymentButton
          membershipId={membership.id}
          teamId={membership.team_id}
          amount={team.weekly_amount || 5}
        />

        <p className="text-xs text-gray-500 text-center mt-4">
          Secure payment processed by Stripe
        </p>
      </div>
    </div>
  );
}