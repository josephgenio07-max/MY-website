// app/pay/[membershipId]/PaymentButton.tsx

'use client';

import { useState } from 'react';
import { createRepeatPaymentCheckout } from './actions';

export default function PaymentButton({
  membershipId,
  teamId,
  amount,
}: {
  membershipId: string;
  teamId: string;
  amount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePayment = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await createRepeatPaymentCheckout(membershipId, teamId, amount);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.url) {
        // Redirect to Stripe checkout
        window.location.href = result.url;
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {loading ? 'Processing...' : `Pay £${amount.toFixed(2)}`}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}