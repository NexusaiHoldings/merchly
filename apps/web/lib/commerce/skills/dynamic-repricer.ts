import { buildDb } from "@/lib/db";

export type CompetitiveStrategy =
  | "match_lowest"
  | "beat_lowest"
  | "price_above_average";

export interface RepricingRule {
  id: string;
  orgId: string;
  listingId: string;
  channel: string;
  floorPrice: number;
  ceilingPrice: number;
  targetMargin: number;
  competitiveStrategy: CompetitiveStrategy;
  priceAdjustmentPercent: number;
  isActive: boolean;
  firstActivationConfirmed: boolean;
}

export interface CompetitorPriceData {
  listingId: string;
  competitorPrices: number[];
  lowestPrice: number;
  averagePrice: number;
}

export interface RepricingResult {
  listingId: string;
  ruleId: string;
  currentPrice: number;
  recommendedPrice: number;
  priceChange: number;
  strategy: CompetitiveStrategy;
  appliedFloor: boolean;
  appliedCeiling: boolean;
  requiresApproval: boolean;
}

export function calculateReprice(
  currentPrice: number,
  rule: RepricingRule,
  competitorData: CompetitorPriceData
): RepricingResult {
  let recommended: number;

  if (rule.competitiveStrategy === "match_lowest") {
    recommended = competitorData.lowestPrice;
  } else if (rule.competitiveStrategy === "beat_lowest") {
    recommended =
      competitorData.lowestPrice * (1 - rule.priceAdjustmentPercent / 100);
  } else {
    recommended =
      competitorData.averagePrice * (1 + rule.priceAdjustmentPercent / 100);
  }

  let appliedFloor = false;
  let appliedCeiling = false;

  if (recommended < rule.floorPrice) {
    recommended = rule.floorPrice;
    appliedFloor = true;
  }

  if (recommended > rule.ceilingPrice) {
    recommended = rule.ceilingPrice;
    appliedCeiling = true;
  }

  recommended = Math.round(recommended * 100) / 100;

  return {
    listingId: rule.listingId,
    ruleId: rule.id,
    currentPrice,
    recommendedPrice: recommended,
    priceChange: Math.round((recommended - currentPrice) * 100) / 100,
    strategy: rule.competitiveStrategy,
    appliedFloor,
    appliedCeiling,
    requiresApproval: !rule.firstActivationConfirmed,
  };
}

export async function fetchActiveRepricingRules(
  orgId: string
): Promise<RepricingRule[]> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT id, org_id, listing_id, channel, floor_price, ceiling_price," +
      " target_margin, competitive_strategy, price_adjustment_percent," +
      " is_active, first_activation_confirmed" +
      " FROM commerce_repricing_rules" +
      " WHERE org_id = $1 AND is_active = true",
    orgId
  );

  return rows.map((r) => ({
    id: String(r.id),
    orgId: String(r.org_id),
    listingId: String(r.listing_id),
    channel: String(r.channel),
    floorPrice: Number(r.floor_price),
    ceilingPrice: Number(r.ceiling_price),
    targetMargin: Number(r.target_margin),
    competitiveStrategy: String(r.competitive_strategy) as CompetitiveStrategy,
    priceAdjustmentPercent: Number(r.price_adjustment_percent),
    isActive: Boolean(r.is_active),
    firstActivationConfirmed: Boolean(r.first_activation_confirmed),
  }));
}

export async function fetchCompetitorPrices(
  listingId: string
): Promise<CompetitorPriceData> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT competitor_price FROM commerce_competitor_prices" +
      " WHERE listing_id = $1 AND recorded_at > NOW() - INTERVAL '24 hours'" +
      " ORDER BY recorded_at DESC",
    listingId
  );

  const prices = rows.map((r) => Number(r.competitor_price)).filter((p) => p > 0);

  const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const averagePrice =
    prices.length > 0
      ? prices.reduce((acc, val) => acc + val, 0) / prices.length
      : 0;

  return { listingId, competitorPrices: prices, lowestPrice, averagePrice };
}

export async function fetchCurrentListingPrice(
  listingId: string,
  orgId: string
): Promise<number | null> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT current_price FROM commerce_listings WHERE id = $1 AND org_id = $2",
    listingId,
    orgId
  );
  if (rows.length === 0) return null;
  return Number(rows[0].current_price);
}

export async function applyRepricingResult(
  result: RepricingResult,
  orgId: string
): Promise<void> {
  if (result.requiresApproval || result.priceChange === 0) return;
  const db = buildDb();
  await db.execute(
    "UPDATE commerce_listings SET current_price = $1, last_repriced_at = NOW()" +
      " WHERE id = $2 AND org_id = $3",
    result.recommendedPrice,
    result.listingId,
    orgId
  );
}

export async function logRepricingResult(
  orgId: string,
  result: RepricingResult
): Promise<void> {
  const db = buildDb();
  await db.execute(
    "INSERT INTO commerce_skill_execution_logs" +
      " (id, org_id, skill_type, entity_id, result_json, requires_approval, confidence, executed_at)" +
      " VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())",
    orgId,
    "dynamic_repricer",
    result.listingId,
    JSON.stringify(result),
    result.requiresApproval,
    1.0
  );
}

export async function saveRepricingRule(
  orgId: string,
  rule: Omit<RepricingRule, "id" | "orgId" | "isActive" | "firstActivationConfirmed">
): Promise<string> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "INSERT INTO commerce_repricing_rules" +
      " (id, org_id, listing_id, channel, floor_price, ceiling_price," +
      " target_margin, competitive_strategy, price_adjustment_percent," +
      " is_active, first_activation_confirmed, created_at)" +
      " VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, false, false, NOW())" +
      " RETURNING id",
    orgId,
    rule.listingId,
    rule.channel,
    rule.floorPrice,
    rule.ceilingPrice,
    rule.targetMargin,
    rule.competitiveStrategy,
    rule.priceAdjustmentPercent
  );
  return String(rows[0]?.id ?? "");
}
