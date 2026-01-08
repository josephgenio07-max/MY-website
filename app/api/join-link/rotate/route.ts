import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { rotateTokenSchema } from "../../../../lib/validation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

function makeToken() {
  return crypto.randomBytes(16).toString("base64url");
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

  try {
    const body = await req.json();
    const validation = rotateTokenSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { teamId } = validation.data;

    const { error: offErr } = await supabase
      .from("join_links")
      .update({ active: false })
      .eq("team_id", teamId)
      .eq("active", true);

    if (offErr) return NextResponse.json({ error: offErr.message }, { status: 500 });

    const token = makeToken();

    const { data: inserted, error: insertErr } = await supabase
      .from("join_links")
      .insert([{ team_id: teamId, token, active: true }])
      .select("token")
      .maybeSingle();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    if (!inserted?.token) return NextResponse.json({ error: "Insert succeeded but token missing." }, { status: 500 });

    return NextResponse.json({ token: inserted.token });
  } catch (err: any) {
    console.error("rotate join link error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}