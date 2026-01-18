"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const inputCls =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 shadow-sm " +
  "focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      setError("Please enter your email and password");
      setLoading(false);
      return;
    }

    try {
      const supabase = supabaseBrowser();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) throw signInError;

      // refresh so server components + route handlers see cookies
      router.replace("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link href="/auth/signup" className="font-medium text-gray-900 hover:text-gray-700">
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-gray-100 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputCls}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>

              <Link
                href="/auth/forgot-password"
                className="text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">New to the platform?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/auth/signup"
                className="w-full flex justify-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
