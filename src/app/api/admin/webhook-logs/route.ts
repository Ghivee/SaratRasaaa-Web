import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/webhook-logs
 *
 * List recent webhook delivery logs for debugging payment verification.
 * Optional query: ?limit=<n> (max 100, default 50)
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), 100);

    const logs = await db.webhookLog.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("[api/admin/webhook-logs]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
