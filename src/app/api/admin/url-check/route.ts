import { NextRequest, NextResponse } from "next/server";
import { verifyAdminUrlSecret } from "@/lib/security";

/**
 * GET /api/admin/url-check?secret=<value>
 *
 * Verifies the `?admin=<secret>` URL parameter against ADMIN_URL_SECRET.
 * This is layer 1 (security through obscurity) of admin access — it only
 * decides whether to RENDER the admin UI on the client. Layer 2 (the admin
 * token typed by the operator) is still required for every mutating API call.
 *
 * Returns 200 if the URL secret matches, 401 otherwise. The response body
 * contains no secret material.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!verifyAdminUrlSecret(secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
