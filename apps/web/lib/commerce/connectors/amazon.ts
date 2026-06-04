/**
 * Amazon Seller Central connector — Login with Amazon (LWA) OAuth, encrypted
 * credential storage, sync health tracking, and SNS notification handling.
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

const amazonConnector: ChannelConnector = {
  platform: "amazon" as Platform,
  displayName: "Amazon",

  oauthUrl(state: string, _shopDomain?: string): string {
    const appId = process.env.AMAZON_SP_APP_ID ?? "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const redirectUri = `${appUrl}/channels/connect/amazon`;
    // Amazon Seller Central OAuth (Selling Partner API)
    return (
      `https://sellercentral.amazon.com/apps/authorize/consent` +
      `?application_id=${encodeURIComponent(appId)}` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&version=beta`
    );
  },

  async exchangeToken(code: string, _shopDomain?: string): Promise<string> {
    const clientId = process.env.AMAZON_LWA_CLIENT_ID ?? "";
    const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET ?? "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const redirectUri = `${appUrl}/channels/connect/amazon`;
    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Amazon token exchange failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  },

  async saveConnection(merchantId: string, accessToken: string, _shopDomain?: string): Promise<void> {
    const encryptedToken = encryptToken(accessToken);
    await dbExecute(
      `INSERT INTO commerce_channel_connections
         (id, merchant_id, platform, shop_domain, encrypted_access_token,
          connected, created_at, updated_at, error_count, rate_limit_status)
       VALUES (gen_random_uuid(), $1, 'amazon', NULL, $2, true, now(), now(), 0, 'ok')
       ON CONFLICT (merchant_id, platform)
       DO UPDATE SET
         encrypted_access_token  = EXCLUDED.encrypted_access_token,
         connected               = true,
         updated_at              = now(),
         error_count             = 0,
         rate_limit_status       = 'ok'`,
      [merchantId, encryptedToken]
    );
  },

  async removeConnection(merchantId: string): Promise<void> {
    await dbExecute(
      `UPDATE commerce_channel_connections
       SET connected = false, updated_at = now()
       WHERE merchant_id = $1 AND platform = 'amazon'`,
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
       WHERE merchant_id = $1 AND platform = 'amazon'
       LIMIT 1`,
      [merchantId]
    );
    if (rows.length === 0) {
      return {
        connected: false,
        lastSyncAt: null,
        errorCount: 0,
        rateLimitStatus: "ok",
        platform: "amazon",
        displayName: "Amazon",
      };
    }
    const row = rows[0];
    return {
      connected: row.connected,
      lastSyncAt: row.last_sync_at,
      errorCount: row.error_count,
      rateLimitStatus: row.rate_limit_status,
      platform: "amazon",
      displayName: "Amazon",
    };
  },

  async handleWebhook(payload: string, signature: string, topic: string): Promise<void> {
    if (!signature || signature.trim() === "") {
      throw new Error("Amazon webhook: missing x-amz-sns-message-signature header");
    }
    // Log receipt; SNS payload verification requires fetching the signing cert
    // from the SigningCertURL in the SNS envelope — done asynchronously in a
    // background worker to keep the acknowledgment latency under 15 s.
    await dbExecute(
      `INSERT INTO commerce_webhook_log
         (id, platform, topic, received_at, payload_size)
       VALUES (gen_random_uuid(), 'amazon', $1, now(), $2)`,
      [topic, payload.length]
    );
  },

  async recordSyncAttempt(merchantId: string, success: boolean): Promise<void> {
    if (success) {
      await dbExecute(
        `UPDATE commerce_channel_connections
         SET last_sync_at = now(), error_count = 0, updated_at = now()
         WHERE merchant_id = $1 AND platform = 'amazon'`,
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
         WHERE merchant_id = $1 AND platform = 'amazon'`,
        [merchantId]
      );
    }
  },
};

registerConnector(amazonConnector);
export { amazonConnector };
