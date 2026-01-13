"use client";

import { useState } from "react";
import supabase from "@/lib/supabase";
import Link from "next/link";

const inputCls =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 shadow-sm " +
  "focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none";

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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          Reset your password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Remember your password?{" "}
          <Link href="/auth/login" className="font-medium text-gray-900 hover:text-gray-700">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-gray-100 rounded-2xl sm:px-10">
          {success ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <h3 className="text-sm font-medium text-green-800">Check your email</h3>
              <p className="mt-2 text-sm text-green-700">
                We&apos;ve sent a password reset link to{" "}
                <strong>{submittedEmail}</strong>.
              </p>
              <div className="mt-4">
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-green-800 hover:text-green-900"
                >
                  Back to sign in →
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <p className="mb-6 text-sm text-gray-600">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
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
                  className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
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
