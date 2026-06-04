/**
 * GET /api/cron/inventory-sync — Nightly inventory reconciliation cron handler.
 *
 * Scheduled to run at 02:00 UTC via vercel.json crons. For each merchant that
 * has the inventory-reconciliation skill enabled and set to a nightly (or
 * compatible) cadence, this handler pulls a fresh inventory snapshot from the
 * DB, detects discrepancies, and writes a reconciliation record.
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

interface InventoryRow {
  product_id: string;
  sku: string;
  merchant_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  last_synced_at: string | null;
}

interface ReconciliationResult {
  merchant_id: string;
  products_checked: number;
  discrepancies_found: number;
  reconciled_at: string;
}

async function reconcileMerchantInventory(
  merchantId: string
): Promise<ReconciliationResult> {
  const db = buildDb();
  const now = new Date().toISOString();

  // Fetch current inventory snapshot for this merchant
  const rows = await db.query<InventoryRow>(
    `SELECT product_id, sku, merchant_id, quantity_on_hand, quantity_reserved, last_synced_at
       FROM inventory_snapshots
      WHERE merchant_id = $1
        AND quantity_on_hand IS NOT NULL
      ORDER BY product_id`,
    merchantId
  );

  let discrepancies = 0;
  const reconciledIds: string[] = [];

  for (const row of rows) {
    const available = row.quantity_on_hand - row.quantity_reserved;

    // Flag any item where available quantity went negative (oversell risk)
    if (available < 0) {
      discrepancies++;
      reconciledIds.push(row.product_id);
    }

    // Mark this snapshot as reconciled by updating last_synced_at
    await db.execute(
      `UPDATE inventory_snapshots
          SET last_synced_at = $1
        WHERE product_id  = $2
          AND merchant_id = $3`,
      now,
      row.product_id,
      merchantId
    );
  }

  // Write a reconciliation log entry
  await db.execute(
    `INSERT INTO inventory_reconciliation_log
       (id, merchant_id, products_checked, discrepancies_found, reconciled_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
     ON CONFLICT DO NOTHING`,
    merchantId,
    rows.length,
    discrepancies,
    now
  );

  await recordSkillRun("inventory-reconciliation", merchantId);

  return {
    merchant_id: merchantId,
    products_checked: rows.length,
    discrepancies_found: discrepancies,
    reconciled_at: now,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const started_at = new Date().toISOString();

  let merchants: Array<{ merchant_id: string; schedule_id: string }>;
  try {
    merchants = await getEnabledMerchantsForSkill("inventory-reconciliation");
  } catch (err) {
    return NextResponse.json(
      { error: "failed to fetch merchant list", detail: String((err as Error).message) },
      { status: 502 }
    );
  }

  if (merchants.length === 0) {
    return NextResponse.json({
      started_at,
      merchants_processed: 0,
      results: [],
      message: "no merchants have inventory-reconciliation enabled",
    });
  }

  const results: ReconciliationResult[] = [];
  const errors: Array<{ merchant_id: string; error: string }> = [];

  for (const { merchant_id } of merchants) {
    try {
      const result = await reconcileMerchantInventory(merchant_id);
      results.push(result);
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
    merchants_processed: results.length,
    errors_count: errors.length,
    results,
    errors,
  });
}
