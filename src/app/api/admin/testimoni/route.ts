import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

// Fetch all testimonis
export async function GET(req: NextRequest) {
  try {
    const testimonis = await db.testimoni.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(testimonis);
  } catch (err) {
    console.error("[api/admin/testimoni GET]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Create new testimoni (Admin only)
export async function POST(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { nama, peran, pesan, rating } = body;

    if (!nama || !peran || !pesan) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    const testimoni = await db.testimoni.create({
      data: {
        nama,
        peran,
        pesan,
        rating: parseInt(rating) || 5,
      },
    });

    return NextResponse.json({ success: true, testimoni });
  } catch (err) {
    console.error("[api/admin/testimoni POST]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Delete testimoni (Admin only)
export async function DELETE(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await db.testimoni.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/admin/testimoni DELETE]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Update testimoni (Admin only)
export async function PUT(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, nama, peran, pesan, rating } = body;

    if (!id || !nama || !peran || !pesan) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    const testimoni = await db.testimoni.update({
      where: { id },
      data: {
        nama,
        peran,
        pesan,
        rating: parseInt(rating) || 5,
      },
    });

    return NextResponse.json({ success: true, testimoni });
  } catch (err) {
    console.error("[api/admin/testimoni PUT]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
