
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

// Ensure we run on Node (service role + crypto, avoids Edge weirdness)
export const runtime = "nodejs";

function makeToken(len = 24) {
  // URL-safe base64 without symbols; length approx = len
  // We generate a bit extra then trim.
  return crypto
    .randomBytes(Math.ceil((len * 3) / 4))
    .toString("base64url")
    .slice(0, len);
}

function isMissingColumnError(msg: string) {
  // Supabase/Postgres errors vary; this is a pragmatic check
  const m = msg.toLowerCase();
  return (
    m.includes("column") &&
    (m.includes("allow_one_off") ||
      m.includes("allow_subscription") ||
      m.includes("allow_custom_amount") ||
      m.includes("default_amount_gbp") ||
      m.includes("min_amount_gbp") ||
      m.includes("max_amount_gbp"))
  );
}

export async function POST(req: Request) {
  try {
    // Auth (cookie session)
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 });
    }
    if (!authData.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId || "").trim();
    if (!teamId) {
      return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
    }

    // Verify manager owns team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, manager_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) {
      return NextResponse.json({ error: teamErr.message }, { status: 400 });
    }
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (team.manager_id !== authData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If an active link already exists, return it
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("payment_links")
      .select("token")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ error: existErr.message }, { status: 400 });
    }
    if (existing?.token) {
      return NextResponse.json({ token: existing.token });
    }

    // Create new link
    const token = makeToken(24);

    // Attempt insert with UX default columns (if your table has them)
    const payloadWithOptions = {
      team_id: teamId,
      token,
      active: true,
      allow_one_off: true,
      allow_subscription: true,
      allow_custom_amount: true,
      default_amount_gbp: null,
      min_amount_gbp: 1,
      max_amount_gbp: 200,
    };

    const { error: insErr } = await supabaseAdmin
      .from("payment_links")
      .insert(payloadWithOptions);

    if (!insErr) {
      return NextResponse.json({ token });
    }

    // Fallback if optional columns don't exist
    if (isMissingColumnError(insErr.message || "")) {
      const { error: insErr2 } = await supabaseAdmin.from("payment_links").insert({
        team_id: teamId,
        token,
        active: true,
      });

      if (insErr2) {
        return NextResponse.json({ error: insErr2.message }, { status: 500 });
      }

      return NextResponse.json({ token });
    }

    return NextResponse.json({ error: insErr.message }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
