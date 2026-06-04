import {
  optimizeListing,
  logListingOptimization,
  defaultOptimizationConfig,
  type ListingData,
  type ListingChannel,
} from "./skills/listing-optimizer";
import {
  calculateReprice,
  fetchActiveRepricingRules,
  fetchCompetitorPrices,
  fetchCurrentListingPrice,
  applyRepricingResult,
  logRepricingResult,
} from "./skills/dynamic-repricer";

export type SkillId = "listing-optimizer" | "dynamic-repricer";

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  cadence: string;
  category: "content" | "pricing";
  requiresConfirmationGate: boolean;
}

export const SKILL_CATALOG: SkillDefinition[] = [
  {
    id: "listing-optimizer",
    name: "Listing Optimizer",
    description:
      "AI-driven title, description, and bullet-point rewrite per channel algorithm." +
      " Improves search ranking and conversion rates autonomously.",
    cadence: "Weekly audit, on-demand execution",
    category: "content",
    requiresConfirmationGate: false,
  },
  {
    id: "dynamic-repricer",
    name: "Dynamic Repricer",
    description:
      "Automated price adjustments with floor/ceiling guardrails and competitive" +
      " positioning. Executes hourly against connected channel data.",
    cadence: "Hourly execution",
    category: "pricing",
    requiresConfirmationGate: true,
  },
];

export interface ListingOptimizationBatchConfig {
  channel: ListingChannel;
  toneGuardrails: string[];
  approvalThreshold: number;
}

export interface BatchResult {
  processed: number;
  requiresApproval: number;
  errors: number;
}

export async function executeListingOptimizationBatch(
  orgId: string,
  listings: ListingData[],
  config: ListingOptimizationBatchConfig
): Promise<BatchResult> {
  const fullConfig = {
    ...defaultOptimizationConfig(config.channel),
    toneGuardrails: config.toneGuardrails,
    approvalThreshold: config.approvalThreshold,
  };

  let processed = 0;
  let requiresApproval = 0;
  let errors = 0;

  for (const listing of listings) {
    try {
      const result = await optimizeListing(listing, fullConfig);
      await logListingOptimization(orgId, result);
      processed++;
      if (result.requiresApproval) requiresApproval++;
    } catch (err) {
      console.error(
        `[skill-executor] listing_optimizer listing=${listing.id} err=${String(err)}`
      );
      errors++;
    }
  }

  return { processed, requiresApproval, errors };
}

export async function executeRepricingBatch(orgId: string): Promise<BatchResult> {
  const rules = await fetchActiveRepricingRules(orgId);

  let processed = 0;
  let requiresApproval = 0;
  let errors = 0;

  for (const rule of rules) {
    try {
      const currentPrice = await fetchCurrentListingPrice(rule.listingId, orgId);
      if (currentPrice === null) {
        console.error(
          `[skill-executor] dynamic_repricer listing=${rule.listingId} not found`
        );
        errors++;
        continue;
      }

      const competitorData = await fetchCompetitorPrices(rule.listingId);
      if (competitorData.competitorPrices.length === 0) {
        competitorData.lowestPrice = currentPrice;
        competitorData.averagePrice = currentPrice;
      }

      const result = calculateReprice(currentPrice, rule, competitorData);
      await applyRepricingResult(result, orgId);
      await logRepricingResult(orgId, result);

      processed++;
      if (result.requiresApproval) requiresApproval++;
    } catch (err) {
      console.error(
        `[skill-executor] dynamic_repricer rule=${rule.id} err=${String(err)}`
      );
      errors++;
    }
  }

  return { processed, requiresApproval, errors };
}

export function getSkillDefinition(skillId: string): SkillDefinition | null {
  return SKILL_CATALOG.find((s) => s.id === skillId) ?? null;
}
