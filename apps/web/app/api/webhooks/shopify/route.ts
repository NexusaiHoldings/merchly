/**
 * POST /api/webhooks/shopify — Shopify webhook receiver.
 *
 * Shopify POSTs signed payloads with X-Shopify-Hmac-Sha256 (base64 HMAC-SHA256
 * over the raw body using SHOPIFY_WEBHOOK_SECRET). Verification happens inside
 * shopifyConnector.handleWebhook(); this route acknowledges with 200 quickly so
 * Shopify doesn't retry, then hands off processing.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import "@/lib/commerce/connectors/shopify";
import { getConnector } from "@/lib/commerce/connectors/base";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "unknown";
  const shopDomain = request.headers.get("x-shopify-shop-domain") ?? "";

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "failed to read body" }, { status: 400 });
  }

  const connector = getConnector("shopify");
  if (!connector) {
    return NextResponse.json({ error: "shopify connector not registered" }, { status: 500 });
  }

  try {
    await connector.handleWebhook(rawBody, signature, topic);
  } catch (err) {
    const message = err instanceof Error ? err.message : "webhook processing error";
    // 401 signals verification failure; Shopify will not retry on 4xx
    if (message.includes("HMAC")) {
      return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
    }
    console.error(JSON.stringify({ event: "shopify_webhook_error", topic, shopDomain, message }));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  console.info(JSON.stringify({ event: "shopify_webhook_received", topic, shopDomain }));
  return NextResponse.json({ received: true });
}
