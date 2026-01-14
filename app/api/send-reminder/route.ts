import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { bulkReminderSchema } from "../../../lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const strictLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
});

function getOrigin(req: Request) {
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  const origin = req.headers.get("origin");
  if (origin) return origin;

  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000"
  );
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (id ?? "").trim()
  );
}

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  return twilio(sid, token);
}

async function sendWhatsApp(toE164: string, body: string) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error("Missing TWILIO_WHATSAPP_FROM");
  const client = twilioClient();

  const msg = await client.messages.create({
    from,
    to: `whatsapp:${toE164}`,
    body,
  });

  return { providerId: msg.sid };
}

async function sendSms(toE164: string, body: string) {
  const from = process.env.TWILIO_SMS_FROM;
  if (!from) throw new Error("Missing TWILIO_SMS_FROM");
  const client = twilioClient();

  const msg = await client.messages.create({
    from,
    to: toE164,
    body,
  });

  return { providerId: msg.sid };
}

async function sendEmailStub(toEmail: string, subject: string, body: string) {
  // plug Resend later (you already have it elsewhere)
  console.log("📧 Email stub:", { toEmail, subject, bodyPreview: body.slice(0, 60) });
  return { providerId: `email_${Date.now()}` };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "send-reminder alive",
    serverSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  });
}

export async function POST(req: Request) {
  console.log("🔥 HIT /api/send-reminder POST");

  try {
    // --- Rate limit ---
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const { success } = await strictLimiter.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // --- Validate body ---
    const rawBody = await req.json();
    const validation = bulkReminderSchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { teamId, message, kind, target } = validation.data;
    console.log("POST payload:", { teamId, kind, targetMode: target.mode });

    if (!isUuid(teamId)) {
      return NextResponse.json({ error: "Bad teamId" }, { status: 400 });
    }

    // --- Auth (manager) ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing auth" }, { status: 401 });
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: "Not authenticated", details: userErr?.message ?? null },
        { status: 401 }
      );
    }

    const managerId = userData.user.id;

    // --- Team ownership ---
    const { data: teamRow, error: teamErr } = await admin
      .from("teams")
      .select("id, manager_id, name")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) {
      return NextResponse.json(
        { error: "Team lookup failed", details: teamErr.message },
        { status: 500 }
      );
    }
    if (!teamRow) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (teamRow.manager_id !== managerId) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    // --- Team plan (default amount) ---
    const { data: planRow, error: planErr } = await admin
      .from("team_plans")
      .select("amount, currency, interval")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr) {
      return NextResponse.json(
        { error: "Plan lookup failed", details: planErr.message },
        { status: 500 }
      );
    }

    // amount is stored in cents in your setup page
    const planAmountCents = Number(planRow?.amount ?? 0);
    const planCurrency = String(planRow?.currency ?? "gbp");
    const planAmountGBP = planAmountCents > 0 ? (planAmountCents / 100) : 5;

    // --- Membership selection ---
    let memberships: any[] = [];

    const baseSelect =
      "id, team_id, status, next_due_at, player_id, custom_amount_gbp, player:players(id, name, email, phone_e164, reminder_consent)";

    if (target.mode === "single") {
      if (!isUuid(target.membershipId)) {
        return NextResponse.json(
          { error: `Bad membershipId: ${target.membershipId}` },
          { status: 400 }
        );
      }

      const { data, error } = await admin
        .from("memberships")
        .select(baseSelect)
        .eq("id", target.membershipId)
        .eq("team_id", teamId)
        .limit(1);

      if (error) {
        return NextResponse.json(
          { error: "Membership lookup failed", details: error.message },
          { status: 500 }
        );
      }

      memberships = data ?? [];
    }

    if (target.mode === "unpaid") {
      const { data, error } = await admin
        .from("memberships")
        .select(baseSelect)
        .eq("team_id", teamId)
        .in("status", ["due", "overdue"]);

      if (error) {
        return NextResponse.json(
          { error: "Membership lookup failed", details: error.message },
          { status: 500 }
        );
      }

      memberships = data ?? [];
    }

    if (target.mode === "due_soon") {
      const now = new Date();
      const until = new Date(
        now.getTime() + target.days * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await admin
        .from("memberships")
        .select(baseSelect)
        .eq("team_id", teamId)
        .eq("status", "active")
        .not("next_due_at", "is", null)
        .lte("next_due_at", until);

      if (error) {
        return NextResponse.json(
          { error: "Membership lookup failed", details: error.message },
          { status: 500 }
        );
      }

      memberships = data ?? [];
    }

    const origin = getOrigin(req).replace(/\/$/, "");

    const results: { membershipId: string; sent: boolean; reason?: string }[] = [];

    for (const m of memberships) {
      const membershipId = String(m.id ?? "");
      const player = m.player;

      if (!membershipId || !isUuid(membershipId)) {
        results.push({ membershipId: membershipId || "unknown", sent: false, reason: "bad_membership" });
        continue;
      }

      if (!player?.reminder_consent) {
        results.push({ membershipId, sent: false, reason: "no_consent" });
        continue;
      }

      // Cooldown check (your function currently returns true, but keep this anyway)
      const { data: ok, error: okErr } = await admin.rpc("can_send_reminder", {
        p_membership_id: membershipId,
        p_cooldown_days: 7,
      });

      if (okErr || !ok) {
        results.push({ membershipId, sent: false, reason: "cooldown" });
        continue;
      }

      const paymentLink = `${origin}/pay/${membershipId}`;

      const amountGBP =
        m.custom_amount_gbp !== null && m.custom_amount_gbp !== undefined
          ? Number(m.custom_amount_gbp)
          : Number.isFinite(planAmountGBP)
          ? planAmountGBP
          : 5;

      const dueDate = m.next_due_at
        ? new Date(m.next_due_at).toLocaleDateString("en-GB")
        : "soon";

      const msgBody =
        message && message.trim()
          ? `${message.trim()}\n\n---\nAmount: £${amountGBP}\nDue: ${dueDate}\n\nPay here: ${paymentLink}`
          : `Hi ${player.name}, your payment for ${teamRow.name} is due.\n\nAmount: £${amountGBP}\nDue: ${dueDate}\n\nPay here: ${paymentLink}`;

      // Decide initial channel we *intend* to use (for logging)
      let intendedChannel: "whatsapp" | "sms" | "email" = player.phone_e164 ? "whatsapp" : "email";

      // 1) Create reminder log FIRST (RPC)
      const { data: reminderId, error: createErr } = await admin.rpc("create_manual_reminder", {
        p_team_id: teamId,
        p_player_id: player.id,
        p_channel: intendedChannel,
        p_message: msgBody,
      });

      if (createErr || !reminderId) {
        // if we can't log, do NOT send (otherwise you'll have untracked messages)
        results.push({ membershipId, sent: false, reason: "log_failed" });
        continue;
      }

      let sent = false;
      let channel: "whatsapp" | "sms" | "email" | "none" = "none";
      let providerId: string | null = null;

      try {
        // 2) Try WhatsApp → fallback SMS → fallback email
        if (player.phone_e164) {
          try {
            const r = await sendWhatsApp(player.phone_e164, msgBody);
            channel = "whatsapp";
            providerId = r.providerId;
            sent = true;
          } catch (waErr) {
            console.log("WhatsApp failed, trying SMS:", waErr);
            try {
              const r = await sendSms(player.phone_e164, msgBody);
              channel = "sms";
              providerId = r.providerId;
              sent = true;
            } catch (smsErr) {
              console.log("SMS failed:", smsErr);
            }
          }
        }

        if (!sent && player.email) {
          try {
            const r = await sendEmailStub(
              player.email,
              `Payment Reminder - ${teamRow.name}`,
              msgBody
            );
            channel = "email";
            providerId = r.providerId;
            sent = true;
          } catch (emailErr) {
            console.log("Email failed:", emailErr);
          }
        }

        // 3) Update channel if it changed vs intended
        if (channel !== "none" && channel !== intendedChannel) {
          await admin.from("reminder_logs").update({ channel }).eq("id", reminderId);
        }

        // 4) Finish reminder log (RPC)
        if (sent) {
          await admin.rpc("finish_reminder", {
            p_id: reminderId,
            p_status: "sent",
            p_provider_id: providerId,
            p_error: null,
          });

          results.push({ membershipId, sent: true });
        } else {
          await admin.from("reminder_logs").update({ channel: "none" }).eq("id", reminderId);

          await admin.rpc("finish_reminder", {
            p_id: reminderId,
            p_status: "failed",
            p_provider_id: null,
            p_error: "delivery_failed",
          });

          results.push({ membershipId, sent: false, reason: "delivery_failed" });
        }
      } catch (err: any) {
        // If anything unexpected happens mid-flight, finish log as failed
        await admin.rpc("finish_reminder", {
          p_id: reminderId,
          p_status: "failed",
          p_provider_id: null,
          p_error: err?.message ?? "unexpected_error",
        });

        results.push({ membershipId, sent: false, reason: "unexpected_error" });
      }
    }

    return NextResponse.json({
      ok: true,
      sent: results.filter((r) => r.sent).length,
      skipped: results.filter((r) => !r.sent).length,
      results,
    });
  } catch (e: any) {
    console.error("Error in send-reminder:", e);
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
