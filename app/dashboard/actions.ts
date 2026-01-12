"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { computeNextDueAtUTC } from "../../lib/due";
import { toE164UK } from "../../lib/phone";
import { generateReceiptEmail } from "../../lib/receiptTemplate";
import { Resend } from "resend";
import { markPaidSchema } from "../../lib/validation";
import twilio from "twilio";

const resend = new Resend(process.env.RESEND_API_KEY!);

function isUuidLike(v: unknown) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ============================================
// MARK PAID ACTION (Original - unchanged)
// ============================================
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

// ============================================
// REMOVE PLAYER ACTION (Original - unchanged)
// ============================================
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

// ============================================
// SEND REMINDER ACTION (UPDATED with payment link)
// ============================================

async function sendWhatsApp(toE164: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    throw new Error("Missing Twilio env vars (ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM).");
  }

  const client = twilio(sid, token);
  const msg = await client.messages.create({
    from,
    to: `whatsapp:${toE164}`,
    body,
  });

  return { providerId: msg.sid };
}

async function sendSms(toE164: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;

  if (!sid || !token || !from) {
    throw new Error("Missing Twilio env vars (ACCOUNT_SID/AUTH_TOKEN/SMS_FROM).");
  }

  const client = twilio(sid, token);
  const msg = await client.messages.create({
    from,
    to: toE164,
    body,
  });

  return { providerId: msg.sid };
}

async function sendEmailStub(toEmail: string, body: string) {
  return { providerId: `email_stub_${Date.now()}` };
}

export async function sendReminder(args: {
  teamId: string;
  membershipId: string;
  message?: string;
}) {
  if (!isUuidLike(args?.teamId)) throw new Error("Missing/invalid teamId.");
  if (!isUuidLike(args?.membershipId)) throw new Error("Missing/invalid membershipId.");

  const supabase = await createSupabaseServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    console.error("Auth error details:", authError);
    throw new Error(`Auth failed: ${authError.message}`);
  }

  if (!user) {
    console.error("No user found in session - cookies may not be present");
    throw new Error("No user session found. Please log in.");
  }

  console.log("Auth successful for user:", user.id);

  const { data, error } = await supabase
    .from("memberships")
    .select(
      `
      id,
      team_id,
      player_id,
      next_due_date,
      players (
        id,
        name,
        email,
        phone_e164,
        reminder_consent
      )
    `
    )
    .eq("id", args.membershipId)
    .eq("team_id", args.teamId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Membership not found.");

  const membership = data;
  const player = Array.isArray((membership as any).players)
    ? (membership as any).players[0]
    : (membership as any).players;

  if (!player) throw new Error("Player not found.");

  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("name, weekly_amount")
    .eq("id", args.teamId)
    .maybeSingle();

  if (teamErr) throw new Error(teamErr.message);

  const teamName = team?.name ?? "your team";
  const amount = team?.weekly_amount || 5;
  
  // Generate payment link
  const paymentLink = `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${membership.id}`;
  
  // Format due date
  const dueDate = membership.next_due_date 
    ? new Date(membership.next_due_date).toLocaleDateString('en-GB')
    : 'soon';

  // Create message with payment link
  let messageBody: string;
  if (args.message && args.message.trim()) {
    // Manager's custom message + payment info below
    messageBody = `${args.message.trim()}\n\n---\nAmount: £${amount}\nDue: ${dueDate}\n\nPay here: ${paymentLink}`;
  } else {
    // Default message with payment info
    messageBody = `Hi ${player.name}, your payment for ${teamName} is due.\n\nAmount: £${amount}\nDue: ${dueDate}\n\nPay here: ${paymentLink}`;
  }

  if (!player.reminder_consent) {
    throw new Error("No consent for reminders.");
  }

  async function attemptSend(channel: "whatsapp" | "sms" | "email") {
    const { data: reminderId, error: createErr } = await supabase.rpc("create_manual_reminder", {
      p_team_id: args.teamId,
      p_player_id: membership.player_id,
      p_channel: channel,
      p_message: messageBody,
    });

    if (createErr) throw new Error(createErr.message);
    if (!reminderId) throw new Error("Failed to create reminder log.");

    try {
      let result: { providerId: string };

      if (channel === "whatsapp") {
        if (!player.phone_e164) throw new Error("No phone");
        result = await sendWhatsApp(player.phone_e164, messageBody);
      } else if (channel === "sms") {
        if (!player.phone_e164) throw new Error("No phone");
        result = await sendSms(player.phone_e164, messageBody);
      } else {
        if (!player.email) throw new Error("No email");
        result = await sendEmailStub(player.email, messageBody);
      }

      const { error: finishErr } = await supabase.rpc("finish_reminder", {
        p_id: reminderId,
        p_status: "sent",
        p_provider_id: result.providerId,
        p_error: null,
      });

      if (finishErr) throw new Error(finishErr.message);
      return true;
    } catch (e: any) {
      await supabase.rpc("finish_reminder", {
        p_id: reminderId,
        p_status: "failed",
        p_provider_id: null,
        p_error: e?.message ?? "Send failed",
      });
      return false;
    }
  }

  if (player.phone_e164) {
    if (await attemptSend("whatsapp")) return;
    if (await attemptSend("sms")) return;
  }

  if (player.email) {
    await attemptSend("email");
    return;
  }

  throw new Error("No valid delivery method (missing phone/email).");
}