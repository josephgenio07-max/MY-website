'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

function makeToken(length = 40) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function prettyFrequency(interval: 'week' | 'month' | 'quarter') {
  if (interval === 'week') return 'weekly';
  if (interval === 'month') return 'monthly';
  return 'quarterly';
}

export default function SetupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [joinLink, setJoinLink] = useState<string | null>(null);

  const [teamName, setTeamName] = useState('');
  const [expectedPlayers, setExpectedPlayers] = useState(26);

  const [amount, setAmount] = useState(20);
  const [interval, setInterval] = useState<'week' | 'month' | 'quarter'>('month');

  const [enableCard, setEnableCard] = useState(true);
  const [enableRecurring, setEnableRecurring] = useState(true);
  const [enableBank, setEnableBank] = useState(false);
  const [bankInstructions, setBankInstructions] = useState(
    'Account name:\nSort code:\nAccount number:\nReference (players must use):'
  );

  const methodsEnabled = useMemo(() => {
    const m: string[] = [];
    if (enableCard) m.push('stripe_one_time');
    if (enableRecurring) m.push('stripe_recurring');
    if (enableBank) m.push('bank_transfer');
    return m;
  }, [enableCard, enableRecurring, enableBank]);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/auth/login');
        return;
      }
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJoinLink(null);
    setTeamId(null);

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace('/auth/login');
      return;
    }

    const name = teamName.trim();
    if (!name) {
      setError('Team name is required.');
      return;
    }
    if (!expectedPlayers || expectedPlayers < 1) {
      setError('Expected players must be at least 1.');
      return;
    }
    if (!amount || amount < 1) {
      setError('Amount must be at least 1.');
      return;
    }
    if (methodsEnabled.length === 0) {
      setError('Enable at least one payment method.');
      return;
    }
    if (enableBank && bankInstructions.trim().length < 10) {
      setError('Please add bank transfer instructions (account + reference).');
      return;
    }

    setSaving(true);
    try {
      // 1) Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          name,
          manager_id: data.user.id,
          expected_players: expectedPlayers,
        })
        .select()
        .single();
      if (teamError) throw teamError;

      setTeamId(team.id);

      // 2) Create plan
      const { error: planError } = await supabase.from('team_plans').insert({
        team_id: team.id,
        amount: Math.round(amount * 100),
        currency: 'gbp',
        interval,
        methods_enabled: methodsEnabled,
        bank_instructions: enableBank ? bankInstructions.trim() : null,
        active: true,
      });
      if (planError) throw planError;

      // 3) Create join link token
      const token = makeToken();
      const { error: linkError } = await supabase.from('join_links').insert({
        team_id: team.id,
        token,
        active: true,
      });
      if (linkError) throw linkError;

      setJoinLink(`${window.location.origin}/join/${token}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create team.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900">Set up your team</h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose how much players pay, how often, and how they can pay. You’ll get one link to share in your group chat.
        </p>

        <form onSubmit={handleCreate} className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Team name</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="e.g., Northside FC U16"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">This is what you’ll see on your dashboard.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Expected players</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="e.g., 26"
                value={expectedPlayers}
                onChange={(e) => setExpectedPlayers(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">Used for “paid vs remaining” stats. You can change it later.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount (£)</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="e.g., 20"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">Per player, per interval.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Frequency</label>
              <select
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900/10"
                value={interval}
                onChange={(e) => setInterval(e.target.value as any)}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Controls reminders and stats.</p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">Quick example</p>
              <p className="mt-1 text-xs text-gray-600">
                {expectedPlayers} players × £{amount} {prettyFrequency(interval)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-900">How can players pay?</p>
            <p className="mt-1 text-xs text-gray-600">
              Card is easiest. Recurring is best for monthly subs. Bank transfer is for players who won’t use card.
            </p>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={enableCard} onChange={(e) => setEnableCard(e.target.checked)} />
                Card payment (one-time)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={enableRecurring} onChange={(e) => setEnableRecurring(e.target.checked)} />
                Recurring subscription (auto-pay)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={enableBank} onChange={(e) => setEnableBank(e.target.checked)} />
                Bank transfer
              </label>

              {enableBank && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">Bank transfer instructions</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900/10"
                    rows={5}
                    value={bankInstructions}
                    onChange={(e) => setBankInstructions(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Include a required reference (e.g., “U16-Name”) so you can match transfers.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            disabled={saving}
            className="w-full rounded-xl bg-gray-900 py-2.5 font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create team & join link'}
          </button>
        </form>

        {/* After creation: show next steps */}
        {joinLink && (
          <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">
            <p className="text-sm font-medium text-green-900">Your join link is ready</p>
            <p className="mt-2 text-sm text-green-900 break-all">{joinLink}</p>

            <div className="mt-3 rounded-xl border border-green-200 bg-white p-3 text-sm text-green-900">
              <p className="font-medium">Next step (manager): Connect Stripe</p>
              <p className="mt-1 text-xs text-green-800">
                Do this once so players can pay by card. After that, share the join link in WhatsApp.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(joinLink);
                  } catch {}
                }}
                className="rounded-lg bg-green-900 px-3 py-2 text-sm font-medium text-white hover:bg-green-800"
              >
                Copy join link
              </button>

              <button
                type="button"
                disabled={!teamId}
                onClick={() => {
                  if (!teamId) return;
                  router.push(`/team/${teamId}/connect-stripe`);
                }}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                Connect Stripe (manager)
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-900 hover:bg-green-100"
              >
                Go to dashboard
              </button>
            </div>

            <p className="mt-3 text-xs text-green-800">
              Players don’t need accounts. They use the join link whenever they need to pay again.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
