/**
 * Shopify channel connector — OAuth via Shopify Partner App, encrypted credential
 * storage, sync health tracking, and webhook signature verification.
 */

import crypto from "crypto";
import { registerConnector, dbQuery, dbExecute } from "./base";
import type { ChannelConnector, Platform, SyncHealth } from "./base";

function encryptToken(token: string): string {
  const rawKey = process.env.CHANNEL_ENCRYPTION_KEY ?? "fallback-key-needs-32-bytes-pad!";
  const key = Buffer.from(rawKey.padEnd(32, "!").slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

const shopifyConnector: ChannelConnector = {
  platform: "shopify" as Platform,
  displayName: "Shopify",

  oauthUrl(state: string, shopDomain?: string): string {
    const shop = shopDomain ?? process.env.SHOPIFY_SHOP_DOMAIN ?? "";
    const clientId = process.env.SHOPIFY_CLIENT_ID ?? "";
    const scopes = "read_products,write_products,read_orders,read_inventory,write_inventory";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const redirectUri = `${appUrl}/channels/connect/shopify`;
    return (
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`
    );
  },

  async exchangeToken(code: string, shopDomain?: string): Promise<string> {
    const clientId = process.env.SHOPIFY_CLIENT_ID ?? "";
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? "";
    const shop = shopDomain ?? process.env.SHOPIFY_SHOP_DOMAIN ?? "";
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify token exchange failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  },

  async saveConnection(merchantId: string, accessToken: string, shopDomain?: string): Promise<void> {
    const encryptedToken = encryptToken(accessToken);
    const shop = shopDomain ?? process.env.SHOPIFY_SHOP_DOMAIN ?? "";
    await dbExecute(
      `INSERT INTO commerce_channel_connections
         (id, merchant_id, platform, shop_domain, encrypted_access_token,
          connected, created_at, updated_at, error_count, rate_limit_status)
       VALUES (gen_random_uuid(), $1, 'shopify', $2, $3, true, now(), now(), 0, 'ok')
       ON CONFLICT (merchant_id, platform)
       DO UPDATE SET
         shop_domain              = EXCLUDED.shop_domain,
         encrypted_access_token   = EXCLUDED.encrypted_access_token,
         connected                = true,
         updated_at               = now(),
         error_count              = 0,
         rate_limit_status        = 'ok'`,
      [merchantId, shop, encryptedToken]
    );
  },

  async removeConnection(merchantId: string): Promise<void> {
    await dbExecute(
      `UPDATE commerce_channel_connections
       SET connected = false, updated_at = now()
       WHERE merchant_id = $1 AND platform = 'shopify'`,
      [merchantId]
    );
  },

  async getSyncHealth(merchantId: string): Promise<SyncHealth> {
    const rows = await dbQuery<{
      connected: boolean;
      last_sync_at: string | null;
      error_count: number;
      rate_limit_status: "ok" | "warning" | "exceeded";
    }>(
      `SELECT connected, last_sync_at, error_count, rate_limit_status
       FROM commerce_channel_connections
       WHERE merchant_id = $1 AND platform = 'shopify'
       LIMIT 1`,
      [merchantId]
    );
    if (rows.length === 0) {
      return {
        connected: false,
        lastSyncAt: null,
        errorCount: 0,
        rateLimitStatus: "ok",
        platform: "shopify",
        displayName: "Shopify",
      };
    }
    const row = rows[0];
    return {
      connected: row.connected,
      lastSyncAt: row.last_sync_at,
      errorCount: row.error_count,
      rateLimitStatus: row.rate_limit_status,
      platform: "shopify",
      displayName: "Shopify",
    };
  },

  async handleWebhook(payload: string, signature: string, topic: string): Promise<void> {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
    const digest = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("base64");
    if (digest !== signature) {
      throw new Error("Shopify webhook HMAC verification failed");
    }
    await dbExecute(
      `INSERT INTO commerce_webhook_log
         (id, platform, topic, received_at, payload_size)
       VALUES (gen_random_uuid(), 'shopify', $1, now(), $2)`,
      [topic, payload.length]
    );
  },

  async recordSyncAttempt(merchantId: string, success: boolean): Promise<void> {
    if (success) {
      await dbExecute(
        `UPDATE commerce_channel_connections
         SET last_sync_at = now(), error_count = 0, updated_at = now()
         WHERE merchant_id = $1 AND platform = 'shopify'`,
        [merchantId]
      );
    } else {
      await dbExecute(
        `UPDATE commerce_channel_connections
         SET error_count        = error_count + 1,
             updated_at         = now(),
             rate_limit_status  = CASE
               WHEN error_count + 1 >= 10 THEN 'exceeded'
               WHEN error_count + 1 >= 5  THEN 'warning'
               ELSE 'ok'
             END
         WHERE merchant_id = $1 AND platform = 'shopify'`,
        [merchantId]
      );
    }
  },
};

registerConnector(shopifyConnector);
export { shopifyConnector };
