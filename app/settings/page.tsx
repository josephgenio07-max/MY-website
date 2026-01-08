"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* ---------------- Preferences ---------------- */

type Prefs = {
  emailAlerts: boolean;
  paymentAlerts: boolean;
  reminderAlerts: boolean;
  weeklySummary: boolean;
};

const LS_KEY = "subsy_manager_prefs_v1";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error();
    return JSON.parse(raw);
  } catch {
    return {
      emailAlerts: true,
      paymentAlerts: true,
      reminderAlerts: true,
      weeklySummary: false,
    };
  }
}

function savePrefs(p: Prefs) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
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
    <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-gray-900" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("—");
  const [createdAt, setCreatedAt] = useState("—");

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [saved, setSaved] = useState(false);

  const canSave = useMemo(() => typeof window !== "undefined", []);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      setEmail(data.user.email ?? "—");
      setCreatedAt(
        data.user.created_at
          ? new Date(data.user.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"
      );
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleLogout() {
    setBusy(true);
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  async function handleResetPassword() {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    alert("Password reset email sent.");
  }

  function handleSavePrefs() {
    savePrefs(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-r-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-200/60">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500">Account & preferences</p>
            </div>
          </div>

          <button
            onClick={() => router.push("/notifications")}
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            🔔 Notifications
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Account */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          <p className="mt-1 text-sm text-gray-500">Your login and identity info.</p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase text-gray-500">Email</p>
              <p className="text-sm font-medium text-gray-900">{email}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase text-gray-500">Account created</p>
              <p className="text-sm font-medium text-gray-900">{createdAt}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/dashboard/teams")}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            >
              Manage Teams
            </button>
            <button
              onClick={handleResetPassword}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            >
              Reset Password
            </button>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-900">Delete account</p>
            <p className="mt-1 text-sm text-gray-500">
              To close your account, contact{" "}
              <a
                href="mailto:support@yourapp.com"
                className="font-medium underline"
              >
                support@yourapp.com
              </a>
              .
            </p>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Notification Preferences
              </h2>
              <p className="text-sm text-gray-500">Stored locally for now.</p>
            </div>
            <button
              onClick={handleSavePrefs}
              disabled={!canSave}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              Save
            </button>
          </div>

          {saved && (
            <p className="mt-2 text-sm font-medium text-emerald-600">
              Preferences saved
            </p>
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
              desc="When payments are marked paid or received."
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
              desc="Overview of due and overdue players."
              checked={prefs.weeklySummary}
              onChange={(v) => setPrefs({ ...prefs, weeklySummary: v })}
            />
          </div>
        </div>

        {/* Logout */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <button
            onClick={handleLogout}
            disabled={busy}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}
