import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

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
  return msg.sid;
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
  return msg.sid;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const { data: dueSoonMemberships, error: dueSoonErr } = await admin
      .from("memberships")
      .select(`
        id,
        team_id,
        player_id,
        next_due_at,
        status,
        teams!inner(id, name),
        players!inner(id, name, phone_e164, reminder_consent)
      `)
      .eq("status", "active")
      .not("next_due_at", "is", null)
      .gte("next_due_at", now.toISOString())
      .lte("next_due_at", threeDaysFromNow.toISOString());

    if (dueSoonErr) {
      console.error("Error fetching due soon:", dueSoonErr);
      return NextResponse.json({ error: dueSoonErr.message }, { status: 500 });
    }

    const { data: overdueMemberships, error: overdueErr } = await admin
      .from("memberships")
      .select(`
        id,
        team_id,
        player_id,
        next_due_at,
        status,
        teams!inner(id, name),
        players!inner(id, name, phone_e164, reminder_consent)
      `)
      .in("status", ["due", "overdue"]);

    if (overdueErr) {
      console.error("Error fetching overdue:", overdueErr);
      return NextResponse.json({ error: overdueErr.message }, { status: 500 });
    }

    const allMemberships = [...(dueSoonMemberships || []), ...(overdueMemberships || [])];
    
    let sent = 0;
    let skipped = 0;

    for (const m of allMemberships) {
      const membership = m as any;
      const player = membership.players;
      const team = membership.teams;

      if (!player?.reminder_consent || !player?.phone_e164) {
        skipped++;
        continue;
      }

      const { data: canSend } = await admin.rpc("can_send_reminder", {
        p_membership_id: membership.id,
        p_cooldown_days: 7,
      });

      if (!canSend) {
        skipped++;
        continue;
      }

      let message: string;
      if (membership.status === "overdue") {
        message = `URGENT: Your payment for ${team.name} is overdue. Please pay as soon as possible.`;
      } else if (membership.status === "due") {
        message = `Reminder: Your payment for ${team.name} is due now. Please pay today.`;
      } else {
        const dueDate = new Date(membership.next_due_at).toLocaleDateString("en-GB");
        message = `Hi ${player.name}, your payment for ${team.name} is due on ${dueDate}. Please pay before then.`;
      }

      try {
        let providerId: string | null = null;
        let channel: string = "whatsapp";

        try {
          providerId = await sendWhatsApp(player.phone_e164, message);
        } catch {
          channel = "sms";
          providerId = await sendSms(player.phone_e164, message);
        }

        await admin.from("reminder_logs").insert({
          team_id: membership.team_id,
          membership_id: membership.id,
          player_id: player.id,
          channel,
          kind: "auto",
          message,
          status: "sent",
          provider_id: providerId,
        });

        sent++;
        console.log(`✅ Auto-reminder sent (membership: ${membership.id})`);
      } catch (e: any) {
        console.error(`❌ Failed to send reminder (membership: ${membership.id}):`, e.message);
        
        await admin.from("reminder_logs").insert({
          team_id: membership.team_id,
          membership_id: membership.id,
          player_id: player.id,
          channel: "whatsapp",
          kind: "auto",
          message,
          status: "failed",
          error: e.message,
        });
        
        skipped++;
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      skipped,
      total: allMemberships.length,
    });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}