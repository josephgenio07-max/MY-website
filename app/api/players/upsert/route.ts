import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../src/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { team_id, name, email, phone } = await req.json();

    if (!team_id || !name || !email) {
      return NextResponse.json(
        { error: "Missing team_id, name, or email" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    // Find existing player for this team+email
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("players")
      .select("id, team_id, name, email, phone")
      .eq("team_id", team_id)
      .eq("email", cleanEmail)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json(
        { error: "Player lookup failed", details: findErr },
        { status: 500 }
      );
    }

    if (existing?.id) {
      // Keep player details fresh
      const updates: { name?: string; phone?: string | null } = {};
      if (existing.name !== cleanName) updates.name = cleanName;
      if ((existing.phone ?? null) !== cleanPhone) updates.phone = cleanPhone;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from("players")
          .update(updates)
          .eq("id", existing.id);

        if (updErr) {
          return NextResponse.json(
            { error: "Player update failed", details: updErr },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ player: { id: existing.id } }, { status: 200 });
    }

    // Create new
    const { data: created, error: insErr } = await supabaseAdmin
      .from("players")
      .insert({
        team_id,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        {
          error: "Player insert failed",
          message: insErr?.message ?? "Unknown",
          details: insErr ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ player: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Upsert route crashed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}
