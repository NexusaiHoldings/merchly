/**
 * POST /api/webhooks/amazon — Amazon SNS / Selling Partner API notification receiver.
 *
 * Amazon delivers marketplace notifications via SNS. Each POST carries a
 * x-amz-sns-message-signature header (base64 RSA-SHA1 over a canonical message
 * string). This route acknowledges quickly (200) to stay within SNS's 15-second
 * timeout; the connector logs the event for async processing.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import "@/lib/commerce/connectors/amazon";
import { getConnector } from "@/lib/commerce/connectors/base";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-amz-sns-message-signature") ?? "";
  const messageType = request.headers.get("x-amz-sns-message-type") ?? "Notification";

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "failed to read body" }, { status: 400 });
  }

  const connector = getConnector("amazon");
  if (!connector) {
    return NextResponse.json({ error: "amazon connector not registered" }, { status: 500 });
  }

  // SNS SubscriptionConfirmation — auto-confirm by fetching the SubscribeURL
  if (messageType === "SubscriptionConfirmation") {
    try {
      const envelope = JSON.parse(rawBody) as { SubscribeURL?: string };
      if (envelope.SubscribeURL) {
        await fetch(envelope.SubscribeURL);
      }
    } catch {
      // Non-fatal — SNS will retry subscription confirmation
    }
    return NextResponse.json({ confirmed: true });
  }

  try {
    await connector.handleWebhook(rawBody, signature, messageType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "webhook processing error";
    if (message.includes("missing")) {
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    console.error(JSON.stringify({ event: "amazon_webhook_error", messageType, message }));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  console.info(JSON.stringify({ event: "amazon_webhook_received", messageType }));
  return NextResponse.json({ received: true });
}
