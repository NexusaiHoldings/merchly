/**
 * /api/commerce/schedules/[id] — one schedule (SESSION-scoped).
 *
 * PATCH  — toggle enabled (the /schedule page's pause/resume control).
 * DELETE — remove the schedule.
 *
 * All operations are scope-checked to the session merchant inside
 * lib/commerce/scheduler.ts (WHERE id = $1 AND merchant_id = $2).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/admin-auth";
import { deleteSchedule, setScheduleEnabled } from "@/lib/commerce/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { enabled?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  try {
    const schedule = await setScheduleEnabled(user.id, params.id, body.enabled);
    if (!schedule) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ schedule });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const removed = await deleteSchedule(user.id, params.id);
    if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
