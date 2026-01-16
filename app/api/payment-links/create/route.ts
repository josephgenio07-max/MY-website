import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function makeToken(len = 24) {
  // URL-safe token (letters + numbers)
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
    if (!teamId) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });

    // Verify manager owns team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, manager_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 400 });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (team.manager_id !== authData.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If an active link already exists, return it (so managers don’t spam-create links)
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("payment_links")
      .select("token")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 400 });
    if (existing?.token) return NextResponse.json({ token: existing.token });

    // Create new link (players choose one-off vs subscription on the public page)
    const token = makeToken(24);

    const { error: insErr } = await supabaseAdmin.from("payment_links").insert({
      team_id: teamId,
      token,
      active: true,

      // Option A UX defaults (requires these columns; remove if your table doesn’t have them)
      allow_one_off: true,
      allow_subscription: true,
      allow_custom_amount: true,
      default_amount_gbp: null,
      min_amount_gbp: 1,
      max_amount_gbp: 200,
    });

    if (insErr) {
      // If your table does NOT have the allow_* / min/max columns, fallback insert:
      const msg = insErr.message || "";
      if (
        msg.includes("allow_one_off") ||
        msg.includes("allow_subscription") ||
        msg.includes("allow_custom_amount") ||
        msg.includes("default_amount_gbp") ||
        msg.includes("min_amount_gbp") ||
        msg.includes("max_amount_gbp")
      ) {
        const { error: insErr2 } = await supabaseAdmin.from("payment_links").insert({
          team_id: teamId,
          token,
          active: true,
        });

        if (insErr2) return NextResponse.json({ error: insErr2.message }, { status: 500 });
        return NextResponse.json({ token });
      }

      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
