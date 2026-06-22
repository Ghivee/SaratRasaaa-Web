import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/status-distribution
 *
 * Returns pendaftar counts grouped by status, for the admin dashboard donut
 * chart. Always returns all three buckets (pending / verified / rejected) so
 * the client does not need to handle missing keys.
 *
 * Response shape:
 *   {
 *     distribution: [
 *       { name: "Pending",  value: 5, color: "#FFB100" },
 *       { name: "Verified", value: 8, color: "#1F8A5F" },
 *       { name: "Rejected", value: 2, color: "#FF2D78" }
 *     ],
 *     total: 15
 *   }
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const [pending, verified, rejected] = await Promise.all([
      db.pendaftar.count({ where: { status: "pending_payment" } }),
      db.pendaftar.count({ where: { status: "verified" } }),
      db.pendaftar.count({ where: { status: "rejected" } }),
    ]);

    const distribution = [
      { name: "Pending", value: pending, color: "#FFB100" },
      { name: "Verified", value: verified, color: "#1F8A5F" },
      { name: "Rejected", value: rejected, color: "#FF2D78" },
    ];

    return NextResponse.json({
      distribution,
      total: pending + verified + rejected,
    });
  } catch (err) {
    console.error("[api/admin/status-distribution]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
