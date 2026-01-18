"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const inputCls =
  "mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 " +
  "placeholder:text-gray-500 shadow-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Please enter your email address");
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await supabaseBrowser().auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (resetError) throw resetError;

      setSubmittedEmail(trimmedEmail);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">Reset your password</h2>
        <p className="mt-2 text-center text-sm text-gray-700">
          Remember your password?{" "}
          <Link href="/auth/login" className="font-semibold text-gray-900 hover:text-gray-700">
            Sign in
          </Link>
        </p>

        <div className="mt-8 bg-white py-8 px-4 shadow-sm border border-gray-200 rounded-2xl sm:px-10">
          {success ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <h3 className="text-sm font-semibold text-green-900">Check your email</h3>
              <p className="mt-2 text-sm text-green-800">
                We&apos;ve sent a password reset link to{" "}
                <strong className="break-all">{submittedEmail}</strong>.
              </p>
              <div className="mt-4">
                <Link
                  href="/auth/login"
                  className="text-sm font-semibold text-green-900 hover:text-green-950"
                >
                  Back to sign in →
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-900">{error}</p>
                </div>
              )}

              <p className="mb-6 text-sm text-gray-700">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-900">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={inputCls}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
