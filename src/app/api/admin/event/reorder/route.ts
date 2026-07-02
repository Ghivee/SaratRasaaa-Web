import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { orderedIds } = await req.json();

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "Format data tidak valid, harus berupa array ID." },
        { status: 400 }
      );
    }

    // Update the urutan for each event based on its index in the array
    const updates = orderedIds.map((id, index) =>
      db.event.update({
        where: { id },
        data: { urutan: index },
      })
    );

    // Run in a transaction
    await db.$transaction(updates);

    return NextResponse.json({ ok: true, message: "Urutan berhasil diperbarui" });
  } catch (error: any) {
    console.error("[api/admin/event/reorder]", error);
    return NextResponse.json(
      { error: "Gagal memperbarui urutan event." },
      { status: 500 }
    );
  }
}
