"use server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import twilio from "twilio";

function isUuidLike(v: unknown) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

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
    .select("name")
    .eq("id", args.teamId)
    .maybeSingle();

  if (teamErr) throw new Error(teamErr.message);

  const teamName = team?.name ?? "your team";
  const body =
    (args.message && args.message.trim()) ||
    `Reminder from ${teamName}: your payment is due. Please pay using the team link.`;

  if (!player.reminder_consent) {
    throw new Error("No consent for reminders.");
  }

  async function attemptSend(channel: "whatsapp" | "sms" | "email") {
    const { data: reminderId, error: createErr } = await supabase.rpc("create_manual_reminder", {
      p_team_id: args.teamId,
      p_player_id: membership.player_id,
      p_channel: channel,
      p_message: body,
    });

    if (createErr) throw new Error(createErr.message);
    if (!reminderId) throw new Error("Failed to create reminder log.");

    try {
      let result: { providerId: string };

      if (channel === "whatsapp") {
        if (!player.phone_e164) throw new Error("No phone");
        result = await sendWhatsApp(player.phone_e164, body);
      } else if (channel === "sms") {
        if (!player.phone_e164) throw new Error("No phone");
        result = await sendSms(player.phone_e164, body);
      } else {
        if (!player.email) throw new Error("No email");
        result = await sendEmailStub(player.email, body);
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