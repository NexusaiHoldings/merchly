import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { executeListingOptimizationBatch } from "@/lib/commerce/skill-executor";
import { type ListingChannel } from "@/lib/commerce/skills/listing-optimizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

const VALID_CHANNELS = new Set<string>(["shopify", "amazon", "ebay"]);

function parseChannel(raw: unknown): ListingChannel {
  const val = String(raw ?? "shopify").toLowerCase();
  return VALID_CHANNELS.has(val) ? (val as ListingChannel) : "shopify";
}

function parseToneGuardrails(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.length > 0) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const db = buildDb();

  let orgRows: Array<Record<string, unknown>>;
  try {
    orgRows = await db.query<Record<string, unknown>>(
      "SELECT a.org_id, c.channel, c.tone_guardrails, c.approval_threshold" +
        " FROM commerce_skill_activations a" +
        " LEFT JOIN commerce_skill_configs c" +
        " ON c.org_id = a.org_id AND c.skill_id = a.skill_id" +
        " WHERE a.skill_id = 'listing-optimizer' AND a.is_active = true"
    );
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
    listingsFetched?: number;
  };

  const results: OrgResult[] = [];

  for (const orgRow of orgRows) {
    const orgId = String(orgRow.org_id);
    const channel = parseChannel(orgRow.channel);
    const toneGuardrails = parseToneGuardrails(orgRow.tone_guardrails);
    const approvalThreshold = Number(orgRow.approval_threshold ?? 0.7);

    try {
      const listingRows = await db.query<Record<string, unknown>>(
        "SELECT id, title, description, bullets, category, keywords" +
          " FROM commerce_listings" +
          " WHERE org_id = $1 AND channel = $2" +
          " AND (last_optimized_at IS NULL" +
          " OR last_optimized_at < NOW() - INTERVAL '7 days')" +
          " ORDER BY last_optimized_at ASC NULLS FIRST" +
          " LIMIT 50",
        orgId,
        channel
      );

      if (listingRows.length === 0) {
        results.push({
          orgId,
          processed: 0,
          requiresApproval: 0,
          errors: 0,
          listingsFetched: 0,
        });
        continue;
      }

      const listings = listingRows.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        description: String(r.description ?? ""),
        bullets: Array.isArray(r.bullets) ? (r.bullets as string[]) : [],
        category: String(r.category ?? ""),
        keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
      }));

      const batchResult = await executeListingOptimizationBatch(orgId, listings, {
        channel,
        toneGuardrails,
        approvalThreshold,
      });

      results.push({
        orgId,
        ...batchResult,
        listingsFetched: listings.length,
      });
    } catch (err) {
      console.error("[cron/listing-audit] org=" + orgId + " err=" + String(err));
      results.push({ orgId, processed: 0, requiresApproval: 0, errors: 1 });
    }
  }

  const totalProcessed = results.reduce((acc, r) => acc + r.processed, 0);
  const totalRequiresApproval = results.reduce((acc, r) => acc + r.requiresApproval, 0);
  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);

  console.log(
    "[cron/listing-audit] orgs=" +
      orgRows.length +
      " processed=" +
      totalProcessed +
      " requiresApproval=" +
      totalRequiresApproval +
      " errors=" +
      totalErrors
  );

  return NextResponse.json({
    orgsProcessed: orgRows.length,
    totalProcessed,
    totalRequiresApproval,
    totalErrors,
    results,
  });
}
