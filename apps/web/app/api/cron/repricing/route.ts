import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { executeRepricingBatch } from "@/lib/commerce/skill-executor";
import { checkActivationAllowed } from "@/lib/commerce/skill-activation-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const db = buildDb();

  let orgIds: string[];
  try {
    const rows = await db.query<Record<string, unknown>>(
      "SELECT DISTINCT org_id FROM commerce_skill_activations" +
        " WHERE skill_id = 'dynamic-repricer'" +
        " AND is_active = true" +
        " AND confirmation_completed_at IS NOT NULL"
    );
    orgIds = rows.map((r) => String(r.org_id));
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch active orgs: " + String((err as Error).message) },
      { status: 502 }
    );
  }

  type OrgResult = {
    orgId: string;
    processed: number;
    requiresApproval: number;
    errors: number;
    skipped?: boolean;
    reason?: string;
  };

  const results: OrgResult[] = [];

  for (const orgId of orgIds) {
    try {
      const guard = await checkActivationAllowed(orgId, "dynamic-repricer");
      if (!guard.allowed) {
        results.push({
          orgId,
          processed: 0,
          requiresApproval: 0,
          errors: 0,
          skipped: true,
          reason: guard.reason,
        });
        continue;
      }

      const batchResult = await executeRepricingBatch(orgId);
      results.push({ orgId, ...batchResult });
    } catch (err) {
      console.error("[cron/repricing] org=" + orgId + " err=" + String(err));
      results.push({ orgId, processed: 0, requiresApproval: 0, errors: 1 });
    }
  }

  const totalProcessed = results.reduce((acc, r) => acc + r.processed, 0);
  const totalRequiresApproval = results.reduce((acc, r) => acc + r.requiresApproval, 0);
  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);

  console.log(
    "[cron/repricing] orgs=" +
      orgIds.length +
      " processed=" +
      totalProcessed +
      " requiresApproval=" +
      totalRequiresApproval +
      " errors=" +
      totalErrors
  );

  return NextResponse.json({
    orgsProcessed: orgIds.length,
    totalProcessed,
    totalRequiresApproval,
    totalErrors,
    results,
  });
}
