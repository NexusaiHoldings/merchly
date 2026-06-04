import { buildDb } from "@/lib/db";

export interface AutonomousAction {
  id: string;
  channel: string;
  action_type: string;
  description: string;
  status: "success" | "error" | "pending" | "overridden";
  executed_at: string;
  minutes_saved: number;
}

export interface ChannelStatus {
  id: string;
  name: string;
  channel_type: string;
  sync_status: "connected" | "disconnected" | "error" | "syncing";
  last_sync_at: string | null;
  error_message: string | null;
}

export interface DashboardMetrics {
  actions_this_week: number;
  hours_saved_estimate: number;
  error_rate: number;
  total_actions: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  recent_actions: AutonomousAction[];
  channel_statuses: ChannelStatus[];
}

const MINUTES_PER_ACTION = 8;

const ZERO_METRICS: DashboardMetrics = {
  actions_this_week: 0,
  hours_saved_estimate: 0,
  error_rate: 0,
  total_actions: 0,
};

export async function getRecentActions(limit = 50): Promise<AutonomousAction[]> {
  try {
    const db = buildDb();
    const rows = await db.query<{
      id: string;
      channel: string;
      action_type: string;
      description: string;
      status: string;
      executed_at: string;
      minutes_saved: number;
    }>(
      `SELECT
        id::text,
        channel,
        action_type,
        description,
        status,
        executed_at::text,
        COALESCE(minutes_saved, $1)::int AS minutes_saved
      FROM commerce_autonomous_actions
      ORDER BY executed_at DESC
      LIMIT $2`,
      MINUTES_PER_ACTION,
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      action_type: row.action_type,
      description: row.description,
      status: row.status as AutonomousAction["status"],
      executed_at: row.executed_at,
      minutes_saved: Number(row.minutes_saved),
    }));
  } catch {
    return [];
  }
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const db = buildDb();
    const rows = await db.query<{
      actions_this_week: string;
      total_actions: string;
      error_count_week: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE executed_at >= NOW() - INTERVAL '7 days')::text AS actions_this_week,
        COUNT(*)::text AS total_actions,
        COUNT(*) FILTER (
          WHERE status = 'error' AND executed_at >= NOW() - INTERVAL '7 days'
        )::text AS error_count_week
      FROM commerce_autonomous_actions`,
    );
    const row = rows[0];
    if (!row) return { ...ZERO_METRICS };
    const actionsThisWeek = parseInt(row.actions_this_week, 10) || 0;
    const totalActions = parseInt(row.total_actions, 10) || 0;
    const errorCountWeek = parseInt(row.error_count_week, 10) || 0;
    const errorRate =
      actionsThisWeek > 0
        ? Math.round((errorCountWeek / actionsThisWeek) * 1000) / 10
        : 0;
    const hoursSaved =
      Math.round((actionsThisWeek * MINUTES_PER_ACTION) / 60 * 10) / 10;
    return {
      actions_this_week: actionsThisWeek,
      hours_saved_estimate: hoursSaved,
      error_rate: errorRate,
      total_actions: totalActions,
    };
  } catch {
    return { ...ZERO_METRICS };
  }
}

export async function getChannelStatuses(): Promise<ChannelStatus[]> {
  try {
    const db = buildDb();
    const rows = await db.query<{
      id: string;
      name: string;
      channel_type: string;
      sync_status: string;
      last_sync_at: string | null;
      error_message: string | null;
    }>(
      `SELECT
        id::text,
        name,
        channel_type,
        sync_status,
        last_sync_at::text,
        error_message
      FROM commerce_channel_connections
      ORDER BY name ASC`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      channel_type: row.channel_type,
      sync_status: row.sync_status as ChannelStatus["sync_status"],
      last_sync_at: row.last_sync_at,
      error_message: row.error_message,
    }));
  } catch {
    return [];
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [metrics, recent_actions, channel_statuses] = await Promise.all([
    getDashboardMetrics(),
    getRecentActions(),
    getChannelStatuses(),
  ]);
  return { metrics, recent_actions, channel_statuses };
}
