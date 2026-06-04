/**
 * GET /api/cron/pii-purge — Nightly PII data-retention purge handler.
 *
 * Deletes or anonymizes personal data that has aged past the configured
 * retention window. Runs nightly at 02:30 UTC (staggered from inventory-sync).
 * Enforces GDPR / CCPA retention rules: user-submitted form data, contact
 * detail snapshots, and abandoned-cart personally-identifiable fields are
 * scrubbed after retention_days (default 365, configurable via
 * PII_RETENTION_DAYS env var).
 *
 * Auth: when CRON_SECRET is set (production), Vercel sends
 *   `Authorization: Bearer <CRON_SECRET>`. We validate it. Unset means dev.
 */

import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { getEnabledMerchantsForSkill, recordSkillRun } from "@/lib/commerce/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function getRetentionDays(): number {
  const raw = process.env.PII_RETENTION_DAYS;
  if (!raw) return 365;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) || parsed < 1 ? 365 : parsed;
}

interface PurgeSummary {
  merchant_id: string;
  contact_details_purged: number;
  cart_pii_scrubbed: number;
  form_submissions_purged: number;
  purged_at: string;
}

async function purgeMerchantPii(
  merchantId: string,
  retentionDays: number
): Promise<PurgeSummary> {
  const db = buildDb();
  const now = new Date().toISOString();

  // 1. Purge stale contact detail snapshots (full row delete — no business value
  //    after retention window)
  const contactRows = await db.query<{ id: string }>(
    `DELETE FROM contact_detail_snapshots
      WHERE merchant_id = $1
        AND captured_at  < now() - ($2 || ' days')::interval
      RETURNING id`,
    merchantId,
    String(retentionDays)
  );

  // 2. Anonymise PII fields in abandoned carts rather than deleting (preserves
  //    aggregate analytics).
  const cartRows = await db.query<{ id: string }>(
    `UPDATE abandoned_carts
        SET customer_email   = NULL,
            customer_name    = NULL,
            customer_phone   = NULL,
            updated_at       = now()
      WHERE merchant_id    = $1
        AND created_at     < now() - ($2 || ' days')::interval
        AND customer_email IS NOT NULL
      RETURNING id`,
    merchantId,
    String(retentionDays)
  );

  // 3. Purge contact-form submissions past retention window.
  const formRows = await db.query<{ id: string }>(
    `DELETE FROM contact_form_submissions
      WHERE merchant_id = $1
        AND submitted_at < now() - ($2 || ' days')::interval
      RETURNING id`,
    merchantId,
    String(retentionDays)
  );

  // 4. Append audit record so compliance team can verify purge ran.
  await db.execute(
    `INSERT INTO pii_purge_log
       (id, merchant_id, retention_days, contact_details_purged,
        cart_pii_scrubbed, form_submissions_purged, purged_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`,
    merchantId,
    retentionDays,
    contactRows.length,
    cartRows.length,
    formRows.length,
    now
  );

  await recordSkillRun("pii-purge", merchantId);

  return {
    merchant_id: merchantId,
    contact_details_purged: contactRows.length,
    cart_pii_scrubbed: cartRows.length,
    form_submissions_purged: formRows.length,
    purged_at: now,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const started_at = new Date().toISOString();
  const retentionDays = getRetentionDays();

  let merchants: Array<{ merchant_id: string; schedule_id: string }>;
  try {
    merchants = await getEnabledMerchantsForSkill("pii-purge");
  } catch (err) {
    return NextResponse.json(
      { error: "failed to fetch merchant list", detail: String((err as Error).message) },
      { status: 502 }
    );
  }

  if (merchants.length === 0) {
    return NextResponse.json({
      started_at,
      retention_days: retentionDays,
      merchants_processed: 0,
      results: [],
      message: "no merchants have pii-purge enabled",
    });
  }

  const results: PurgeSummary[] = [];
  const errors: Array<{ merchant_id: string; error: string }> = [];

  for (const { merchant_id } of merchants) {
    try {
      const summary = await purgeMerchantPii(merchant_id, retentionDays);
      results.push(summary);
    } catch (err) {
      errors.push({
        merchant_id,
        error: String((err as Error).message).slice(0, 300),
      });
    }
  }

  return NextResponse.json({
    started_at,
    finished_at: new Date().toISOString(),
    retention_days: retentionDays,
    merchants_processed: results.length,
    errors_count: errors.length,
    results,
    errors,
  });
}
