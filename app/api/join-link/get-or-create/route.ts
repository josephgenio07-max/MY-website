import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { getTokenSchema } from "../../../../lib/validation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function makeToken() {
  return crypto.randomBytes(16).toString("base64url");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = getTokenSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { teamId } = validation.data;

    const { data: existing, error: existingErr } = await supabase
      .from("join_links")
      .select("token")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    if (existing?.token) return NextResponse.json({ token: existing.token });

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
    console.error("get-or-create join link error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}