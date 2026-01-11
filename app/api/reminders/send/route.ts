import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { bulkReminderSchema } from "../../../../lib/validation";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

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
  const validation = bulkReminderSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.issues },
      { status: 400 }
    );
  }

  const { teamId, message, kind, target } = validation.data;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  if (!token) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const managerId = userData.user.id;

  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .select("id, manager_id, name, weekly_amount")
    .eq("id", teamId)
    .maybeSingle();

  if (teamErr || !teamRow) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  
  if (teamRow.manager_id !== managerId) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let memberships: any[] = [];

  if (target.mode === "single") {
    const { data, error } = await admin
      .from("memberships")
      .select("id, team_id, status, next_due_date, player_id, players(id, name, email, phone_e164, reminder_consent)")
      .eq("id", target.membershipId)
      .eq("team_id", teamId)
      .limit(1);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    memberships = data ?? [];
  }

  if (target.mode === "unpaid") {
    const { data, error } = await admin
      .from("memberships")
      .select("id, team_id, status, next_due_date, player_id, players(id, name, email, phone_e164, reminder_consent)")
      .eq("team_id", teamId)
      .in("status", ["due", "overdue"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    memberships = data ?? [];
  }

  if (target.mode === "due_soon") {
    const days = target.days;
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("memberships")
      .select("id, team_id, status, next_due_date, player_id, players(id, name, email, phone_e164, reminder_consent)")
      .eq("team_id", teamId)
      .eq("status", "active")
      .not("next_due_date", "is", null)
      .lte("next_due_date", until);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    memberships = data ?? [];
  }

  const results: { membershipId: string; sent: boolean; reason?: string }[] = [];

  for (const m of memberships) {
    const membershipId = m.id as string;
    const player = Array.isArray((m as any).players)
      ? (m as any).players[0]
      : (m as any).players;

    if (!player?.reminder_consent) {
      results.push({ membershipId, sent: false, reason: "no_consent" });
      continue;
    }

    const { data: ok, error: okErr } = await admin.rpc("can_send_reminder", {
      p_membership_id: membershipId,
      p_cooldown_days: 7,
    });

    if (okErr || !ok) {
      results.push({ membershipId, sent: false, reason: "cooldown" });
      continue;
    }

    // UPDATED: Generate payment link for this membership
    const paymentLink = `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${membershipId}`;
    
    // UPDATED: Format amount and due date
    const amount = teamRow.weekly_amount || 5;
    const dueDate = m.next_due_date 
      ? new Date(m.next_due_date).toLocaleDateString('en-GB')
      : 'soon';

    // UPDATED: Include payment link in message
    const msgBody = message || 
      `Hi ${player.name}, your payment for ${teamRow.name} is due.\n\nAmount: £${amount}\nDue: ${dueDate}\n\nPay here: ${paymentLink}`;

    let sent = false;
    let channel = "none";

    // Try WhatsApp first
    if (player.phone_e164) {
      try {
        await sendWhatsApp(player.phone_e164, msgBody);
        channel = "whatsapp";
        sent = true;
      } catch (waErr) {
        console.log("WhatsApp failed, trying SMS:", waErr);
        try {
          await sendSms(player.phone_e164, msgBody);
          channel = "sms";
          sent = true;
        } catch (smsErr) {
          console.log("SMS failed, trying email:", smsErr);
        }
      }
    }

    // Try email if phone methods failed
    if (!sent && player.email) {
      try {
        await sendEmail(player.email, `Payment Reminder - ${teamRow.name}`, msgBody);
        channel = "email";
        sent = true;
      } catch (emailErr) {
        console.log("Email failed:", emailErr);
      }
    }

    if (sent) {
      await admin.from("reminder_logs").insert({
        team_id: teamId,
        membership_id: membershipId,
        player_id: player?.id ?? null,
        channel,
        kind,
        message: msgBody,
        status: "sent",
      });
      results.push({ membershipId, sent: true });
    } else {
      results.push({ membershipId, sent: false, reason: "delivery_failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    count: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent).length,
    results,
  });
}