"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

type Prefs = {
  emailAlerts: boolean;
  paymentAlerts: boolean;
  reminderAlerts: boolean;
  weeklySummary: boolean;
};

const LS_KEY = "subsy_manager_prefs_v1";

const DEFAULT_PREFS: Prefs = {
  emailAlerts: true,
  paymentAlerts: true,
  reminderAlerts: true,
  weeklySummary: false,
};

function safeLoadPrefs(): Prefs {
  try {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function safeSavePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full text-left flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 hover:bg-gray-50 active:scale-[0.99] transition"
    >
      <div className="pr-4">
        <p className="text-base font-semibold text-gray-900">{label}</p>
        <p className="mt-1 text-sm text-gray-600">{desc}</p>
      </div>

      <span
        aria-hidden
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
          checked ? "bg-gray-900" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

function ActionCard({
  title,
  desc,
  onClick,
  icon,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-lg">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-600">{desc}</p>
        </div>
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const returnTo = (sp.get("returnTo") || "/dashboard").trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [status, setStatus] = useState<string | null>(null);

  const canResetPassword = useMemo(() => {
    return Boolean(email && email.includes("@"));
  }, [email]);

  useEffect(() => {
    setPrefs(safeLoadPrefs());
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      setEmail(data.user.email ?? "");
      setCreatedAt(
        data.user.created_at
          ? new Date(data.user.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : ""
      );

      setLoading(false);
    }
    init();
  }, [router]);

  async function handleLogout() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      router.replace("/auth/login");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!canResetPassword) {
      setStatus("No email found for password reset.");
      return;
    }

    setStatus("Sending reset email…");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      setStatus(`Reset failed: ${error.message}`);
      return;
    }

    setStatus("Password reset email sent.");
    setTimeout(() => setStatus(null), 2000);
  }

  function handleSavePrefs() {
    safeSavePrefs(prefs);
    setStatus("Preferences saved.");
    setTimeout(() => setStatus(null), 1500);
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(returnTo)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Back
            </button>

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-600">Account, teams, notifications, feedback</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-10">
        <section className="space-y-3">
          <ActionCard
            icon="🏠"
            title="Dashboard"
            desc="Go back to your manager dashboard."
            onClick={() => router.push("/dashboard")}
          />
          <ActionCard
            icon="👥"
            title="Manage Teams"
            desc="Create, edit, archive or delete teams."
            onClick={() => router.push("/dashboard/teams?returnTo=/settings")}
          />
          <ActionCard
            icon="🔔"
            title="Notifications"
            desc="View reminders, updates, and system alerts."
            onClick={() => router.push("/notifications?returnTo=/settings")}
          />
          <ActionCard
            icon="💬"
            title="Feedback"
            desc="Report a bug or request a feature."
            onClick={() => {
              window.location.href =
                "mailto:support@yourapp.com?subject=Subsy%20Feedback&body=What%20happened%3F%0A%0AWhat%20did%20you%20expect%3F%0A%0APlease%20include%20screenshots%20if%20possible.";
            }}
          />
        </section>

        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          <p className="mt-1 text-sm text-gray-600">Your login details.</p>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Email</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 break-all">{email || "Unknown"}</p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Account created</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{createdAt || "Unknown"}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleResetPassword}
              disabled={!canResetPassword}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Reset password
            </button>

            <button
              onClick={() => (window.location.href = "mailto:support@yourapp.com?subject=Delete%20my%20account")}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-gray-50"
            >
              Delete account
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
              <p className="mt-1 text-sm text-gray-600">Stored on this device for now.</p>
            </div>

            <button
              onClick={handleSavePrefs}
              disabled={!prefsLoaded}
              className="shrink-0 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Save
            </button>
          </div>

          {status && (
            <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800">
              {status}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <ToggleRow
              label="Email alerts"
              desc="General account and system updates."
              checked={prefs.emailAlerts}
              onChange={(v) => setPrefs({ ...prefs, emailAlerts: v })}
            />
            <ToggleRow
              label="Payment alerts"
              desc="When payments are received or marked paid."
              checked={prefs.paymentAlerts}
              onChange={(v) => setPrefs({ ...prefs, paymentAlerts: v })}
            />
            <ToggleRow
              label="Reminder alerts"
              desc="When reminders are sent."
              checked={prefs.reminderAlerts}
              onChange={(v) => setPrefs({ ...prefs, reminderAlerts: v })}
            />
            <ToggleRow
              label="Weekly summary"
              desc="Weekly overview of due and overdue players."
              checked={prefs.weeklySummary}
              onChange={(v) => setPrefs({ ...prefs, weeklySummary: v })}
            />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm border border-gray-100">
          <button
            onClick={handleLogout}
            disabled={busy}
            className="w-full rounded-2xl bg-red-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Logout
          </button>
        </section>
      </div>
    </main>
  );
}
