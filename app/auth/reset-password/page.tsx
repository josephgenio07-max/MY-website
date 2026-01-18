"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const inputCls =
  "mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 " +
  "placeholder:text-gray-500 shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      setChecking(true);
      setError(null);

      const { data, error: sessErr } = await supabaseBrowser().auth.getSession();

      if (!alive) return;

      if (sessErr) {
        setError(sessErr.message);
      } else if (!data.session) {
        setError("This reset link is invalid or expired. Please request a new one.");
      }

      setChecking(false);
    }

    run();

    return () => {
      alive = false;
    };
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!password || !confirmPassword) {
      setError("Please fill in both password fields.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const { error: updErr } = await supabaseBrowser().auth.updateUser({ password });
      if (updErr) throw updErr;

      setSuccess(true);

      setTimeout(() => {
        router.replace("/auth/login");
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">Choose a new password</h2>
        <p className="mt-2 text-center text-sm text-gray-700">
          Or{" "}
          <Link href="/auth/login" className="font-semibold text-gray-900 hover:text-gray-700">
            go back to sign in
          </Link>
        </p>

        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-2xl sm:px-10">
          {checking ? (
            <p className="text-sm text-gray-800">Checking reset link...</p>
          ) : success ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <p className="text-sm font-semibold text-green-900">Password updated successfully.</p>
              <p className="mt-1 text-sm text-green-800">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-900">{error}</p>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-900">
                    New password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    className={inputCls}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-600">Must be at least 6 characters</p>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-semibold text-gray-900"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    className={inputCls}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || Boolean(error)}
                  className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {loading ? "Updating..." : "Update password"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  Request a new reset link
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
