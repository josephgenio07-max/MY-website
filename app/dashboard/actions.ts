"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeNextDueAtUTC } from "../../lib/due";
import { toE164UK } from "../../lib/phone";
import { generateReceiptEmail } from "../../lib/receiptTemplate";
import { Resend } from "resend";
import { markPaidSchema } from "../../lib/validation";

const resend = new Resend(process.env.RESEND_API_KEY!);

function isUuidLike(v: unknown) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function markPaidAction(args: {
  teamId: string;
  playerId: string;
  amount: number;
  currency: string;
  note?: string;
}) {
  const validation = markPaidSchema.safeParse(args);
  
  if (!validation.success) {
    throw new Error(`Invalid input: ${validation.error.issues[0]?.message}`);
  }
  
  const { teamId, playerId, amount, currency, note } = validation.data;

  const now = new Date();

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, due_weekday, due_day_of_month, due_month_in_quarter")
    .eq("id", teamId)
    .single();

  if (teamErr || !team) throw new Error(teamErr?.message || "Team not found");

  const { data: plan, error: planErr } = await supabaseAdmin
    .from("team_plans")
    .select("interval")
    .eq("team_id", teamId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planErr || !plan?.interval) throw new Error(planErr?.message || "Active plan not found");

  const interval = plan.interval as "week" | "month" | "quarter";
  const nextDue = computeNextDueAtUTC(now, interval, team);

  const { data: membership, error: mErr } = await supabaseAdmin
    .from("memberships")
    .select("id")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);

  let membershipId = membership?.id as string | undefined;

  if (!membershipId) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from("memberships")
      .insert({
        team_id: teamId,
        player_id: playerId,
        plan_interval: interval,
        billing_type: "manual",
        status: "active",
        last_paid_at: now.toISOString(),
        next_due_at: nextDue.toISOString(),
      })
      .select("id")
      .single();

    if (cErr || !created) throw new Error(cErr?.message || "Failed to create membership");
    membershipId = created.id;
  } else {
    const { error: uErr } = await supabaseAdmin
      .from("memberships")
      .update({
        status: "active",
        plan_interval: interval,
        last_paid_at: now.toISOString(),
        next_due_at: nextDue.toISOString(),
      })
      .eq("id", membershipId);

    if (uErr) throw new Error(uErr.message);
  }

  if (!isUuidLike(membershipId)) throw new Error("Failed to resolve membershipId.");

  const { error: payErr } = await supabaseAdmin.from("payments").insert({
    team_id: teamId,
    player_id: playerId,
    membership_id: membershipId,
    amount: amount,
    currency: currency,
    method: "manual",
    note: note ?? null,
    paid_at: now.toISOString(),
    status: "paid",
  });

  if (payErr) throw new Error(payErr.message);

  const { data: player, error: pErr } = await supabaseAdmin
    .from("players")
    .select("id, name, email, phone, phone_e164")
    .eq("id", playerId)
    .single();

  if (pErr) throw new Error(pErr.message);

  if (player && !player.phone_e164 && player.phone) {
    const fixed = toE164UK(player.phone);
    if (fixed) await supabaseAdmin.from("players").update({ phone_e164: fixed }).eq("id", player.id);
  }

  const receiptNumber = `RCP-${Date.now()}`;

  const receipt = generateReceiptEmail({
    playerName: player?.name || "Player",
    teamName: team.name,
    amount: amount,
    currency: currency,
    paidAt: now.toISOString(),
    receiptNumber,
  });

  if (player?.email) {
    try {
      console.log("📧 Sending receipt to player:", player.id);
      await resend.emails.send({
        from: "Your Team <onboarding@resend.dev>",
        to: player.email,
        subject: receipt.subject,
        text: receipt.text,
        html: receipt.html,
      });
      console.log("✅ Receipt sent successfully");
    } catch (e) {
      console.error("❌ Failed to send receipt email:", e);
    }
  }

  revalidatePath("/dashboard");
}

export async function removePlayerAction(args: { teamId: string; playerId: string }) {
  if (!isUuidLike(args?.teamId)) throw new Error("Missing/invalid teamId.");
  if (!isUuidLike(args?.playerId)) throw new Error("Missing/invalid playerId.");

  const { error } = await supabaseAdmin
    .from("memberships")
    .update({
      status: "canceled",
      next_due_at: null,
    })
    .eq("team_id", args.teamId)
    .eq("player_id", args.playerId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
}