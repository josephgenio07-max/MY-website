"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function makeToken(len = 40) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type Interval = "week" | "month" | "quarter";
type BillingType = "one_off" | "subscription";

export async function createPaymentLinkAction(args: {
  teamId: string;
  amountCents: number;
  billingType: BillingType;
  interval: Interval;
  dueAt: string | null; // ISO string
}) {
  if (!args.teamId) throw new Error("Missing teamId");
  if (!Number.isFinite(args.amountCents) || args.amountCents <= 0) throw new Error("Invalid amount");
  if (!["one_off", "subscription"].includes(args.billingType)) throw new Error("Invalid billing type");
  if (!["week", "month", "quarter"].includes(args.interval)) throw new Error("Invalid interval");

  // still use plan currency
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("team_plans")
    .select("interval, currency")
    .eq("team_id", args.teamId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planErr || !plan?.currency) throw new Error(planErr?.message || "Active plan not found");

  const token = makeToken(40);

  const { error } = await supabaseAdmin.from("payment_links").insert({
    team_id: args.teamId,
    token,
    amount: args.amountCents,
    currency: plan.currency ?? "gbp",

    // keep the plan interval for reference (what the team is configured as)
    interval: plan.interval ?? "month",

    // NEW: manager-selected overrides
    interval_override: args.interval,
    due_at: args.dueAt,

    billing_type: args.billingType,
    active: true,
    max_uses: 1,
    uses: 0,
  });

  if (error) throw new Error(error.message);

  return { token };
}
