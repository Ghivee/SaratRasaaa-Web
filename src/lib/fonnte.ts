/**
 * Helper to send WhatsApp messages using Fonnte API.
 * Requires FONNTE_TOKEN to be set in environment variables.
 */

export async function sendFonnteMessage(target: string, message: string): Promise<boolean> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.error("[Fonnte] FONNTE_TOKEN is not configured.");
    return false;
  }

  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target,
        message,
        delay: "1", // minimum delay to prevent blocking
        countryCode: "62", // Default to Indonesia
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Fonnte] API returned error:", res.status, text);
      return false;
    }

    const data = await res.json();
    if (data.status) {
      return true;
    } else {
      console.error("[Fonnte] Failed to send message:", data);
      return false;
    }
  } catch (error) {
    console.error("[Fonnte] Error sending message:", error);
    return false;
  }
}
