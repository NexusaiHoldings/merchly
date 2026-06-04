/**
 * Skill Scheduling Engine — server-side logic for managing per-merchant,
 * per-skill cadence configurations.
 *
 * Supports 5 cadence options:
 *   1. hourly   — repricing, every hour
 *   2. daily    — digest / general daily jobs
 *   3. nightly  — inventory reconciliation, runs at 02:00 UTC
 *   4. weekly   — listing audits, runs Sunday 03:00 UTC
 *   5. custom   — arbitrary cron expression supplied by the merchant
 *
 * Records are stored in the `skill_schedules` table (see
 * packages/db/company/commerce.ts). All IDs are UUID.
 */

import { buildDb } from "@/lib/db";

export type CadenceType = "hourly" | "daily" | "nightly" | "weekly" | "custom";

export interface SkillSchedule {
  id: string;
  merchant_id: string;
  skill_name: string;
  cadence: CadenceType;
  cron_expression: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertScheduleInput {
  merchant_id: string;
  skill_name: string;
  cadence: CadenceType;
  custom_cron?: string;
  enabled?: boolean;
}

/** Map of named cadences to their cron expressions. */
const CADENCE_CRON: Record<Exclude<CadenceType, "custom">, string> = {
  hourly: "0 * * * *",
  daily: "0 8 * * *",
  nightly: "0 2 * * *",
  weekly: "0 3 * * 0",
};

/**
 * Resolve the cron expression for a cadence.
 * Throws if cadence is "custom" and no expression is provided.
 */
export function resolveCronExpression(
  cadence: CadenceType,
  custom_cron?: string
): string {
  if (cadence === "custom") {
    if (!custom_cron || custom_cron.trim() === "") {
      throw new Error("custom cadence requires a non-empty cron expression");
    }
    const parts = custom_cron.trim().split(/\s+/);
    if (parts.length < 5) {
      throw new Error(
        `invalid cron expression '${custom_cron}': must have 5 or 6 space-separated fields`
      );
    }
    return custom_cron.trim();
  }
  return CADENCE_CRON[cadence];
}

/** Estimate next run time from a cron expression (approximate, UTC). */
function estimateNextRun(cronExpr: string): Date {
  const now = new Date();
  const parts = cronExpr.trim().split(/\s+/);
  const minute = parts[0] === "*" ? now.getUTCMinutes() : parseInt(parts[0], 10);
  const hour = parts[1] === "*" ? now.getUTCHours() : parseInt(parts[1], 10);

  const next = new Date(now);
  next.setUTCSeconds(0, 0);

  if (parts[1] === "*") {
    // hourly: next full minute boundary
    next.setUTCMinutes(isNaN(minute) ? 0 : minute);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  } else if (parts[4] === "0" && parts[2] === "*") {
    // weekly: next Sunday
    const dayOfWeek = now.getUTCDay();
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    next.setUTCDate(next.getUTCDate() + daysUntilSunday);
    next.setUTCHours(isNaN(hour) ? 0 : hour, isNaN(minute) ? 0 : minute);
  } else {
    // daily / nightly: next occurrence at the specified hour
    next.setUTCHours(isNaN(hour) ? 0 : hour, isNaN(minute) ? 0 : minute);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

/**
 * List all skill schedules for a merchant.
 */
export async function listSchedules(merchantId: string): Promise<SkillSchedule[]> {
  const db = buildDb();
  const rows = await db.query<SkillSchedule>(
    `SELECT id, merchant_id, skill_name, cadence, cron_expression, enabled,
            last_run_at, next_run_at, created_at, updated_at
       FROM skill_schedules
      WHERE merchant_id = $1
      ORDER BY skill_name, created_at`,
    merchantId
  );
  return rows;
}

/**
 * Get a single schedule by ID (scope-checked to merchantId).
 */
export async function getSchedule(
  merchantId: string,
  scheduleId: string
): Promise<SkillSchedule | null> {
  const db = buildDb();
  const rows = await db.query<SkillSchedule>(
    `SELECT id, merchant_id, skill_name, cadence, cron_expression, enabled,
            last_run_at, next_run_at, created_at, updated_at
       FROM skill_schedules
      WHERE id = $1
        AND merchant_id = $2`,
    scheduleId,
    merchantId
  );
  return rows[0] ?? null;
}

/**
 * Create or update (upsert) a skill schedule.
 * One schedule per (merchant_id, skill_name) — upserts on conflict.
 */
export async function upsertSchedule(input: UpsertScheduleInput): Promise<SkillSchedule> {
  const { merchant_id, skill_name, cadence, custom_cron, enabled = true } = input;
  const cronExpr = resolveCronExpression(cadence, custom_cron);
  const nextRun = estimateNextRun(cronExpr);

  const db = buildDb();
  const rows = await db.query<SkillSchedule>(
    `INSERT INTO skill_schedules
       (id, merchant_id, skill_name, cadence, cron_expression, enabled,
        next_run_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (merchant_id, skill_name)
     DO UPDATE SET
       cadence          = EXCLUDED.cadence,
       cron_expression  = EXCLUDED.cron_expression,
       enabled          = EXCLUDED.enabled,
       next_run_at      = EXCLUDED.next_run_at,
       updated_at       = now()
     RETURNING id, merchant_id, skill_name, cadence, cron_expression, enabled,
               last_run_at, next_run_at, created_at, updated_at`,
    merchant_id,
    skill_name,
    cadence,
    cronExpr,
    enabled,
    nextRun.toISOString()
  );
  return rows[0];
}

/**
 * Toggle enabled/disabled for a schedule.
 */
export async function setScheduleEnabled(
  merchantId: string,
  scheduleId: string,
  enabled: boolean
): Promise<SkillSchedule | null> {
  const db = buildDb();
  const rows = await db.query<SkillSchedule>(
    `UPDATE skill_schedules
        SET enabled = $1, updated_at = now()
      WHERE id = $2
        AND merchant_id = $3
      RETURNING id, merchant_id, skill_name, cadence, cron_expression, enabled,
                last_run_at, next_run_at, created_at, updated_at`,
    enabled,
    scheduleId,
    merchantId
  );
  return rows[0] ?? null;
}

/**
 * Delete a schedule (scope-checked to merchantId).
 */
export async function deleteSchedule(
  merchantId: string,
  scheduleId: string
): Promise<boolean> {
  const db = buildDb();
  const rows = await db.query<{ id: string }>(
    `DELETE FROM skill_schedules
      WHERE id = $1
        AND merchant_id = $2
      RETURNING id`,
    scheduleId,
    merchantId
  );
  return rows.length > 0;
}

/**
 * Record a successful execution for a schedule and compute the next run time.
 * Called by cron route handlers after a skill runs.
 */
export async function recordSkillRun(
  skillName: string,
  merchantId: string
): Promise<void> {
  const db = buildDb();
  // Fetch current cron expression to compute next run
  const rows = await db.query<{ cron_expression: string }>(
    `SELECT cron_expression FROM skill_schedules
      WHERE skill_name = $1
        AND merchant_id = $2
        AND enabled = true
      LIMIT 1`,
    skillName,
    merchantId
  );
  if (rows.length === 0) return;

  const nextRun = estimateNextRun(rows[0].cron_expression);
  await db.execute(
    `UPDATE skill_schedules
        SET last_run_at = now(),
            next_run_at = $1,
            updated_at  = now()
      WHERE skill_name  = $2
        AND merchant_id = $3`,
    nextRun.toISOString(),
    skillName,
    merchantId
  );
}

/**
 * Fetch all enabled schedules for a given skill across all merchants.
 * Used by cron handlers to decide which merchants need processing.
 */
export async function getEnabledMerchantsForSkill(
  skillName: string
): Promise<Array<{ merchant_id: string; schedule_id: string }>> {
  const db = buildDb();
  const rows = await db.query<{ merchant_id: string; schedule_id: string }>(
    `SELECT merchant_id, id AS schedule_id
       FROM skill_schedules
      WHERE skill_name = $1
        AND enabled    = true
      ORDER BY merchant_id`,
    skillName
  );
  return rows;
}

/** Return descriptive metadata for each cadence option shown in the UI. */
export function getCadenceOptions(): Array<{
  value: CadenceType;
  label: string;
  description: string;
  cronExpression: string | null;
}> {
  return [
    {
      value: "hourly",
      label: "Hourly",
      description: "Run every hour — ideal for real-time repricing.",
      cronExpression: CADENCE_CRON.hourly,
    },
    {
      value: "daily",
      label: "Daily (8 AM UTC)",
      description: "Run once per day — great for morning digest reports.",
      cronExpression: CADENCE_CRON.daily,
    },
    {
      value: "nightly",
      label: "Nightly (2 AM UTC)",
      description: "Run every night — standard for inventory reconciliation.",
      cronExpression: CADENCE_CRON.nightly,
    },
    {
      value: "weekly",
      label: "Weekly (Sunday 3 AM UTC)",
      description: "Run once per week — fits comprehensive listing audits.",
      cronExpression: CADENCE_CRON.weekly,
    },
    {
      value: "custom",
      label: "Custom cron",
      description: "Enter your own cron expression for precise scheduling.",
      cronExpression: null,
    },
  ];
}
