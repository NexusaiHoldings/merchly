import type { JSX } from "react";
import { revalidatePath } from "next/cache";
import {
  getDashboardData,
  type AutonomousAction,
  type ChannelStatus,
} from "@/lib/commerce/dashboard-aggregator";
import { buildDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const CHANNEL_COLORS: Record<string, string> = {
  shopify: "#96bf48",
  amazon: "#ff9900",
  ebay: "#e53238",
  woocommerce: "#7f54b3",
};

function formatTimestamp(ts: string | null): string {
  if (!ts) return "Never";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function statusBadge(status: AutonomousAction["status"]): JSX.Element {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    success: { bg: "rgba(22,163,74,0.1)", color: "#15803d", label: "Success" },
    error: { bg: "rgba(220,38,38,0.1)", color: "#b91c1c", label: "Error" },
    pending: { bg: "rgba(234,179,8,0.1)", color: "#a16207", label: "Pending" },
    overridden: { bg: "rgba(107,114,128,0.1)", color: "#4b5563", label: "Overridden" },
  };
  const st = styles[status] ?? styles["pending"]!;
  return (
    <span
      style={{
        background: st.bg,
        color: st.color,
        padding: "0.2rem 0.5rem",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {st.label}
    </span>
  );
}

function syncDot(syncStatus: ChannelStatus["sync_status"]): JSX.Element {
  const colorMap: Record<string, string> = {
    connected: "#16a34a",
    syncing: "#2563eb",
    error: "#dc2626",
    disconnected: "#9ca3af",
  };
  const dotColor = colorMap[syncStatus] ?? "#9ca3af";
  return <span style={{ color: dotColor, fontSize: 12 }}>●</span>;
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { metrics, recent_actions, channel_statuses } = await getDashboardData();

  async function overrideAction(formData: FormData): Promise<void> {
    "use server";
    const actionId = formData.get("actionId");
    if (typeof actionId !== "string" || !actionId) return;
    try {
      const db = buildDb();
      await db.execute(
        "UPDATE commerce_autonomous_actions SET status = $1 WHERE id = $2",
        "overridden",
        actionId,
      );
    } catch {
      // DB table may not exist in early deploys; continue silently
    }
    revalidatePath("/dashboard");
  }

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Autonomous Actions Dashboard
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: "0.5rem 0 0" }}>
          Real-time view of AI-executed actions across all connected channels
        </p>
      </header>

      <section aria-label="Summary metrics" style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          <MetricCard
            label="Actions This Week"
            value={metrics.actions_this_week.toLocaleString()}
            sub={`${metrics.total_actions.toLocaleString()} actions all time`}
            accent="#2563eb"
          />
          <MetricCard
            label="Hours Saved"
            value={`${metrics.hours_saved_estimate.toFixed(1)} h`}
            sub="Estimated this week"
            accent="#16a34a"
          />
          <MetricCard
            label="Error Rate"
            value={`${metrics.error_rate.toFixed(1)}%`}
            sub="Actions with errors this week"
            accent={metrics.error_rate > 5 ? "#dc2626" : "#374151"}
          />
        </div>
      </section>

      <section aria-label="Channel sync status" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 1rem" }}>
          Connected Channels
        </h2>
        {channel_statuses.length === 0 ? (
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            No channels connected yet. Connect a channel to start automating.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {channel_statuses.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Recent autonomous actions">
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 1rem" }}>
          Recent Actions
        </h2>
        {recent_actions.length === 0 ? (
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            No autonomous actions recorded yet.
          </p>
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            {recent_actions.map((action, idx) => (
              <div
                key={action.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0.875rem 1.25rem",
                  background: idx % 2 === 0 ? "#fff" : "rgba(0,0,0,0.015)",
                  borderBottom:
                    idx < recent_actions.length - 1
                      ? "1px solid rgba(0,0,0,0.06)"
                      : "none",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {action.description}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {action.channel} · {action.action_type.replace(/_/g, " ")} ·{" "}
                    {formatTimestamp(action.executed_at)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    ~{action.minutes_saved} min saved
                  </span>
                  {statusBadge(action.status)}
                  {action.status !== "overridden" && (
                    <form action={overrideAction}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <button
                        type="submit"
                        style={{
                          fontSize: 12,
                          padding: "0.3rem 0.7rem",
                          border: "1px solid rgba(0,0,0,0.15)",
                          borderRadius: 5,
                          background: "#fff",
                          cursor: "pointer",
                          color: "#374151",
                        }}
                      >
                        Override
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10,
        padding: "1.25rem",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6b7280",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          margin: "0.5rem 0 0.25rem",
          color: accent,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelStatus }): JSX.Element {
  const accent = CHANNEL_COLORS[channel.channel_type] ?? "#6b7280";
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 8,
        padding: "1rem",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{channel.name}</span>
        {syncDot(channel.sync_status)}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>
        {channel.channel_type} · {channel.sync_status}
      </div>
      {channel.last_sync_at && (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          Last sync: {formatTimestamp(channel.last_sync_at)}
        </div>
      )}
      {channel.error_message && (
        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
          {channel.error_message}
        </div>
      )}
    </div>
  );
}
