"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function assertUuid(id: string, label: string) {
  const ok =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      (id ?? "").trim()
    );
  if (!ok) throw new Error(`${label} is not a valid UUID: "${id}"`);
}

/**
 * Base URL from headers (works on Vercel/proxies) fallback to env/local
 */
async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_BASE_URL ??
      "http://localhost:3000"
    );
  }

  return `${proto}://${host}`;
}

async function getAuthToken() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Not logged in. Please refresh the page.");
  }

  return token;
}

async function callReminderApi(baseUrl: string, token: string, body: any) {
  const res = await fetch(`${baseUrl}/api/send-reminder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    throw new Error(json?.error || text || "Failed to send reminder.");
  }

  return json;
}

// ============================================
// SINGLE REMINDER
// ============================================

type SendReminderArgs = {
  teamId: string;
  membershipId: string;
  message?: string;
};

export async function sendReminder(args: SendReminderArgs) {
  assertUuid(args.teamId, "teamId");
  assertUuid(args.membershipId, "membershipId");

  const baseUrl = await getBaseUrl();
  const token = await getAuthToken();

  return await callReminderApi(baseUrl, token, {
    teamId: args.teamId,
    message: args.message?.trim() ?? "",
    kind: "manual",
    target: { mode: "single", membershipId: args.membershipId },
  });
}

// ============================================
// BULK REMINDERS
// ============================================

type BulkReminderTarget =
  | { mode: "unpaid" }
  | { mode: "due_soon"; days: number }
  | { mode: "single"; membershipId: string };

type SendBulkArgs = {
  teamId: string;
  message?: string;
  kind?: "manual" | "auto";
  target: BulkReminderTarget;
};

export async function sendBulkReminders(args: SendBulkArgs) {
  assertUuid(args.teamId, "teamId");
  if (args.target.mode === "single") {
    assertUuid(args.target.membershipId, "membershipId");
  }

  const baseUrl = await getBaseUrl();
  const token = await getAuthToken();

  return await callReminderApi(baseUrl, token, {
    teamId: args.teamId,
    message: args.message?.trim() ?? "",
    kind: args.kind ?? "manual",
    target: args.target,
  });
}
