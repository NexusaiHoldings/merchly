/**
 * /channels — Commerce Channel Registry dashboard.
 *
 * Server component: fetches per-channel sync health for the current merchant
 * and renders connection status cards. Merchants selling on 3+ channels need
 * a single place to monitor all sales platforms (ICP requirement).
 */

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/admin-auth";
import "@/lib/commerce/connectors/shopify";
import "@/lib/commerce/connectors/amazon";
import { listConnectors } from "@/lib/commerce/connectors/base";
import type { SyncHealth } from "@/lib/commerce/connectors/base";

export const dynamic = "force-dynamic";

async function getAllChannelHealth(merchantId: string): Promise<SyncHealth[]> {
  const connectors = listConnectors();
  const results = await Promise.allSettled(
    connectors.map((c) => c.getSyncHealth(merchantId))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<SyncHealth> => r.status === "fulfilled")
    .map((r) => r.value);
}

function RateLimitBadge({ status }: { readonly status: SyncHealth["rateLimitStatus"] }): JSX.Element {
  const styles: Record<string, string> = {
    ok: "background:#d1fae5;color:#065f46;",
    warning: "background:#fef3c7;color:#92400e;",
    exceeded: "background:#fee2e2;color:#991b1b;",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        cssText: styles[status] ?? styles.ok,
      } as React.CSSProperties}
    >
      Rate limit: {status}
    </span>
  );
}

function ChannelCard({ health }: { readonly health: SyncHealth }): JSX.Element {
  const statusColor = health.connected ? "#059669" : "#6b7280";
  const lastSync = health.lastSyncAt
    ? new Date(health.lastSyncAt).toLocaleString()
    : "Never";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "20px 24px",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{health.displayName}</h2>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: statusColor,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
            }}
          />
          {health.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#6b7280" }}>
        <span>Last sync: {lastSync}</span>
        <span>Errors: {health.errorCount}</span>
        <RateLimitBadge status={health.rateLimitStatus} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {!health.connected ? (
          <a
            href={`/channels/connect/${health.platform}`}
            style={{
              padding: "8px 16px",
              background: "#2563eb",
              color: "#ffffff",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Connect
          </a>
        ) : (
          <a
            href={`/channels/connect/${health.platform}?action=disconnect`}
            style={{
              padding: "8px 16px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              color: "#374151",
            }}
          >
            Manage
          </a>
        )}
      </div>
    </div>
  );
}

export default async function ChannelsPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const healthList = await getAllChannelHealth(user.id);

  const connectedCount = healthList.filter((h) => h.connected).length;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Sales Channels</h1>
        <p style={{ color: "#6b7280", marginTop: 8 }}>
          {connectedCount} of {healthList.length} channel{healthList.length !== 1 ? "s" : ""} connected
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {healthList.map((health) => (
          <ChannelCard key={health.platform} health={health} />
        ))}
      </div>

      {healthList.length === 0 && (
        // Defensive fallback: getAllChannelHealth drops connectors whose
        // health check throws, so if everything fails we still give the
        // user a way forward instead of a dead end (QA-flagged).
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            border: "1px dashed #cbd5e1",
            borderRadius: 8,
            background: "#f8fafc",
          }}
        >
          <p style={{ fontWeight: 600, color: "#0f172a", marginTop: 0 }}>
            Connect your first sales channel
          </p>
          <p style={{ color: "#475569", maxWidth: 420, margin: "0 auto 20px" }}>
            Merchly monitors sync health, pricing, and listings across your channels. Start by
            connecting the platform you sell on.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="/channels/connect/shopify"
              style={{ padding: "8px 16px", background: "#2563eb", color: "#ffffff", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
            >
              Connect Shopify
            </a>
            <a
              href="/channels/connect/amazon"
              style={{ padding: "8px 16px", background: "#2563eb", color: "#ffffff", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600 }}
            >
              Connect Amazon
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
