"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Verify your email</h1>
        <p className="mt-2 text-sm text-gray-600">
          Check your inbox and click the verification link to activate your account.
        </p>

        <div className="mt-6 space-y-2">
          <p className="text-xs text-gray-500">
            After verifying, you’ll be redirected automatically. If not, just sign in.
          </p>

          <Link
            href="/auth/login"
            className="inline-flex w-full justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
