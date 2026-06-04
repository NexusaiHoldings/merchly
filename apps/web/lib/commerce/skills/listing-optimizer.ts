import { buildDb } from "@/lib/db";

export type ListingChannel = "shopify" | "amazon" | "ebay";

export interface ListingOptimizationConfig {
  channel: ListingChannel;
  toneGuardrails: string[];
  approvalThreshold: number;
  maxTitleLength: number;
  maxDescriptionLength: number;
}

export interface ListingData {
  id: string;
  title: string;
  description: string;
  bullets: string[];
  category: string;
  keywords: string[];
}

export interface OptimizedListing {
  listingId: string;
  originalTitle: string;
  optimizedTitle: string;
  originalDescription: string;
  optimizedDescription: string;
  optimizedBullets: string[];
  confidence: number;
  requiresApproval: boolean;
  channel: ListingChannel;
}

interface AiResponsePayload {
  title?: unknown;
  description?: unknown;
  bullets?: unknown;
  confidence?: unknown;
}

function buildOptimizationPrompt(listing: ListingData, config: ListingOptimizationConfig): string {
  const toneNote =
    config.toneGuardrails.length > 0
      ? ` Tone guardrails: ${config.toneGuardrails.join(", ")}.`
      : "";
  return (
    `Optimize this ${config.channel} product listing for maximum conversion.` +
    toneNote +
    ` Title limit: ${config.maxTitleLength} chars.` +
    ` Description limit: ${config.maxDescriptionLength} chars.` +
    ` Current title: "${listing.title}".` +
    ` Current description: "${listing.description}".` +
    ` Current bullets: ${listing.bullets.join(" | ")}.` +
    ` Category: ${listing.category}.` +
    ` Target keywords: ${listing.keywords.join(", ")}.` +
    " Return JSON with keys: title (string), description (string)," +
    " bullets (string[]), confidence (number 0-1)."
  );
}

async function callAiGateway(prompt: string): Promise<AiResponsePayload> {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;

  if (!gatewayUrl || !apiKey) {
    throw new Error("AI_GATEWAY_URL and AI_GATEWAY_API_KEY must be configured");
  }

  const resp = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AI gateway returned ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(content) as AiResponsePayload;
  } catch {
    return {};
  }
}

export async function optimizeListing(
  listing: ListingData,
  config: ListingOptimizationConfig
): Promise<OptimizedListing> {
  const prompt = buildOptimizationPrompt(listing, config);
  const ai = await callAiGateway(prompt);

  const confidence =
    typeof ai.confidence === "number" ? Math.min(1, Math.max(0, ai.confidence)) : 0.8;
  const optimizedTitle =
    typeof ai.title === "string" && ai.title.length > 0 ? ai.title : listing.title;
  const optimizedDescription =
    typeof ai.description === "string" && ai.description.length > 0
      ? ai.description
      : listing.description;
  const optimizedBullets =
    Array.isArray(ai.bullets) && ai.bullets.length > 0
      ? (ai.bullets as string[])
      : listing.bullets;

  return {
    listingId: listing.id,
    originalTitle: listing.title,
    optimizedTitle,
    originalDescription: listing.description,
    optimizedDescription,
    optimizedBullets,
    confidence,
    requiresApproval: confidence < config.approvalThreshold,
    channel: config.channel,
  };
}

export async function logListingOptimization(
  orgId: string,
  result: OptimizedListing
): Promise<void> {
  const db = buildDb();
  await db.execute(
    "INSERT INTO commerce_skill_execution_logs" +
      " (id, org_id, skill_type, entity_id, result_json, requires_approval, confidence, executed_at)" +
      " VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())",
    orgId,
    "listing_optimizer",
    result.listingId,
    JSON.stringify(result),
    result.requiresApproval,
    result.confidence
  );
}

export async function fetchListingsDueForAudit(
  orgId: string,
  channel: ListingChannel,
  limit = 50
): Promise<ListingData[]> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT id, title, description, bullets, category, keywords" +
      " FROM commerce_listings" +
      " WHERE org_id = $1 AND channel = $2" +
      " AND (last_optimized_at IS NULL OR last_optimized_at < NOW() - INTERVAL '7 days')" +
      " ORDER BY last_optimized_at ASC NULLS FIRST" +
      " LIMIT $3",
    orgId,
    channel,
    limit
  );

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    bullets: Array.isArray(r.bullets) ? (r.bullets as string[]) : [],
    category: String(r.category ?? ""),
    keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
  }));
}

export function defaultOptimizationConfig(
  channel: ListingChannel
): ListingOptimizationConfig {
  const titleLimits: Record<ListingChannel, number> = {
    shopify: 70,
    amazon: 200,
    ebay: 80,
  };
  const descLimits: Record<ListingChannel, number> = {
    shopify: 5000,
    amazon: 2000,
    ebay: 4000,
  };
  return {
    channel,
    toneGuardrails: [],
    approvalThreshold: 0.7,
    maxTitleLength: titleLimits[channel],
    maxDescriptionLength: descLimits[channel],
  };
}
