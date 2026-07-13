/**
 * /api/commerce/schedules — skill automation schedules (SESSION-scoped).
 *
 * GET  — list the current merchant's schedules.
 * POST — create/update (upsert) a schedule for a skill.
 *
 * The /schedule page has fetched this route since it shipped, but the route
 * never existed — every load showed an HTTP 404 banner (QA-flagged broken).
 * Backed by lib/commerce/scheduler.ts (already fully built) +
 * skill_schedules (DDL in packages/db/company/commerce.ts).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/admin-auth";
import {
  listSchedules,
  upsertSchedule,
  type CadenceType,
} from "@/lib/commerce/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CADENCES = new Set(["hourly", "daily", "nightly", "weekly", "custom"]);

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const schedules = await listSchedules(user.id);
    return NextResponse.json({ schedules });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    skill_name?: string;
    cadence?: string;
    custom_cron?: string;
    enabled?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const skillName = (body.skill_name ?? "").trim();
  if (!skillName) {
    return NextResponse.json({ error: "skill_name is required" }, { status: 400 });
  }
  if (!body.cadence || !CADENCES.has(body.cadence)) {
    return NextResponse.json(
      { error: "cadence must be one of hourly | daily | nightly | weekly | custom" },
      { status: 400 },
    );
  }

  try {
    const schedule = await upsertSchedule({
      merchant_id: user.id,
      skill_name: skillName,
      cadence: body.cadence as CadenceType,
      custom_cron: body.custom_cron,
      enabled: body.enabled ?? true,
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    // resolveCronExpression throws a descriptive error on bad custom cron.
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 400 });
  }
}
