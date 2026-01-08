import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { Resend } from "resend";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { reminderSchema } from "../../../../lib/validation";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const resend = new Resend(process.env.RESEND_API_KEY!);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const strictLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
});

async function sendWhatsApp(toE164: string, body: string) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
  const msg = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: `whatsapp:${toE164}`,
    body,
  });
  return { providerId: msg.sid };
}

async function sendSms(toE164: string, body: string) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
  const msg = await client.messages.create({
    from: process.env.TWILIO_SMS_FROM!,
    to: toE164,
    body,
  });
  return { providerId: msg.sid };
}

async function sendEmail(toEmail: string, subject: string, body: string) {
  console.log("📧 Sending email to player");
  return { providerId: `email_${Date.now()}` };
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const { success } = await strictLimiter.limit(ip);
  
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const validation = reminderSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.issues },
      { status: 400 }
    );
  }

  const { teamId, membershipId, message } = validation.data;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  if (!token) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: membership, error } = await admin
    .from("memberships")
    .select("id, team_id, player_id, players(id, name, email, phone_e164, reminder_consent)")
    .eq("id", membershipId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const player = Array.isArray((membership as any).players)
    ? (membership as any).players[0]
    : (membership as any).players;

  if (!player?.reminder_consent) {
    return NextResponse.json({ error: "No consent for reminders" }, { status: 400 });
  }

  const { data: team } = await admin
    .from("teams")
    .select("name, manager_id")
    .eq("id", teamId)
    .single();

  if (team?.manager_id !== userData.user.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const msgBody = message || `Reminder from ${team.name}: your payment is due.`;

  const { data: canSend } = await admin.rpc("can_send_reminder", {
    p_membership_id: membershipId,
    p_cooldown_days: 7,
  });

  if (!canSend) {
    return NextResponse.json({ error: "Cooldown active" }, { status: 400 });
  }

  if (player.phone_e164) {
    try {
      await sendWhatsApp(player.phone_e164, msgBody);
      await admin.from("reminder_logs").insert({
        team_id: teamId,
        membership_id: membershipId,
        player_id: player.id,
        channel: "whatsapp",
        kind: "manual",
        message: msgBody,
        status: "sent",
      });
      return NextResponse.json({ ok: true, channel: "whatsapp" });
    } catch (waErr) {
      console.log("WhatsApp failed, trying SMS:", waErr);
      try {
        await sendSms(player.phone_e164, msgBody);
        await admin.from("reminder_logs").insert({
          team_id: teamId,
          membership_id: membershipId,
          player_id: player.id,
          channel: "sms",
          kind: "manual",
          message: msgBody,
          status: "sent",
        });
        return NextResponse.json({ ok: true, channel: "sms" });
      } catch (smsErr) {
        console.log("SMS failed, trying email:", smsErr);
      }
    }
  }

  if (player.email) {
    try {
      await sendEmail(player.email, `Payment Reminder - ${team.name}`, msgBody);
      await admin.from("reminder_logs").insert({
        team_id: teamId,
        membership_id: membershipId,
        player_id: player.id,
        channel: "email",
        kind: "manual",
        message: msgBody,
        status: "sent",
      });
      return NextResponse.json({ ok: true, channel: "email" });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "No contact method available" }, { status: 400 });
}