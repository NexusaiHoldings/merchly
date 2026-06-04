/**
 * Commerce action logger — immutable append-only audit log for AI-executed
 * commerce actions (price changes, listing updates, inventory adjustments).
 *
 * Uses pg pool (same singleton pattern as apps/web/lib/db.ts). Table is
 * created idempotently on first call so no separate migration step is needed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_pool) return _pool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool: PgPool } = require("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

export interface ActionLogEntry {
  id: string;
  actionType: string;
  skill: string;
  channel: string;
  entityId: string;
  entityType: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  executedAt: Date;
  revertedAt: Date | null;
  revertedBy: string | null;
  merchantId: string;
}

export interface ActionFilters {
  channel?: string;
  skill?: string;
  fromDate?: Date;
  toDate?: Date;
  merchantId?: string;
  limit?: number;
  offset?: number;
}

let _tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commerce_action_log (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      action_type TEXT        NOT NULL,
      skill       TEXT        NOT NULL,
      channel     TEXT        NOT NULL,
      entity_id   TEXT        NOT NULL,
      entity_type TEXT        NOT NULL,
      before_state JSONB      NOT NULL,
      after_state  JSONB      NOT NULL,
      executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reverted_at  TIMESTAMPTZ,
      reverted_by  TEXT,
      merchant_id  TEXT        NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS commerce_action_log_merchant_time_idx
      ON commerce_action_log (merchant_id, executed_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS commerce_action_log_channel_idx
      ON commerce_action_log (channel)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS commerce_action_log_skill_idx
      ON commerce_action_log (skill)
  `);
  _tableEnsured = true;
}

function rowToEntry(row: Record<string, unknown>): ActionLogEntry {
  return {
    id: row.id as string,
    actionType: row.action_type as string,
    skill: row.skill as string,
    channel: row.channel as string,
    entityId: row.entity_id as string,
    entityType: row.entity_type as string,
    beforeState: row.before_state as Record<string, unknown>,
    afterState: row.after_state as Record<string, unknown>,
    executedAt: row.executed_at as Date,
    revertedAt: (row.reverted_at as Date | null) ?? null,
    revertedBy: (row.reverted_by as string | null) ?? null,
    merchantId: row.merchant_id as string,
  };
}

export async function logAction(
  entry: Omit<ActionLogEntry, "id" | "executedAt" | "revertedAt" | "revertedBy">
): Promise<ActionLogEntry> {
  await ensureTable();
  const pool = getPool();
  const rows = await pool.query(
    `INSERT INTO commerce_action_log
       (action_type, skill, channel, entity_id, entity_type,
        before_state, after_state, merchant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      entry.actionType,
      entry.skill,
      entry.channel,
      entry.entityId,
      entry.entityType,
      JSON.stringify(entry.beforeState),
      JSON.stringify(entry.afterState),
      entry.merchantId,
    ]
  );
  const row = (rows.rows as Record<string, unknown>[])[0];
  return rowToEntry(row);
}

export async function getActions(
  filters: ActionFilters = {}
): Promise<ActionLogEntry[]> {
  await ensureTable();
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.merchantId) {
    params.push(filters.merchantId);
    conditions.push(`merchant_id = $${params.length}`);
  }
  if (filters.channel) {
    params.push(filters.channel);
    conditions.push(`channel = $${params.length}`);
  }
  if (filters.skill) {
    params.push(filters.skill);
    conditions.push(`skill = $${params.length}`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    conditions.push(`executed_at >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    conditions.push(`executed_at <= $${params.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit ?? 50);
  const limitPlaceholder = params.length;
  params.push(filters.offset ?? 0);
  const offsetPlaceholder = params.length;

  const sql = `
    SELECT * FROM commerce_action_log
    ${where}
    ORDER BY executed_at DESC
    LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}
  `;

  const rows = await pool.query(sql, params);
  return (rows.rows as Record<string, unknown>[]).map(rowToEntry);
}

export async function getActionById(
  id: string
): Promise<ActionLogEntry | null> {
  await ensureTable();
  const pool = getPool();
  const rows = await pool.query(
    "SELECT * FROM commerce_action_log WHERE id = $1",
    [id]
  );
  const all = rows.rows as Record<string, unknown>[];
  if (all.length === 0) return null;
  return rowToEntry(all[0]);
}

export async function markReverted(
  id: string,
  revertedBy: string
): Promise<void> {
  await ensureTable();
  const pool = getPool();
  await pool.query(
    `UPDATE commerce_action_log
     SET reverted_at = NOW(), reverted_by = $2
     WHERE id = $1 AND reverted_at IS NULL`,
    [id, revertedBy]
  );
}
