import { Suspense } from "react";
import NewPaymentLinkClient from "./NewPaymentLinkClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] bg-gray-50 px-4 py-10">
          <div className="mx-auto w-full max-w-lg">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                Loading…
              </div>
            </div>
          </div>
        </main>
      }
    >
      <NewPaymentLinkClient />
    </Suspense>
  );
}
