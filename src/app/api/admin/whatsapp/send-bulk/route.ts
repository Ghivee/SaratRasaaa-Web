import { NextRequest, NextResponse } from "next/server";
import { sendFonnteMessage } from "@/lib/fonnte";

export async function POST(req: NextRequest) {
  try {
    // Basic auth check
    const token = req.headers.get("X-Admin-Token");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // In a real app we'd verify the token with Supabase or JWT, but we just check presence for now matching the existing admin routes.

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Send messages in parallel
    const results = await Promise.all(
      messages.map(async (msg) => {
        const { target, text, kode } = msg;
        const success = await sendFonnteMessage(target, text);
        return { kode, success };
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({ success: true, results, successCount, failCount }, { status: 200 });
  } catch (error) {
    console.error("[api/whatsapp/send-bulk]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
