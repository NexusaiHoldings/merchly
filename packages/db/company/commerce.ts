/**
 * Commerce domain tables (merchly) — DDL consolidation
 * (product-flywheel-001; same class as millbuilt/condocentral-table-ddl-
 * consolidation-001).
 *
 * Every table the commerce features query, in one place, run by
 * packages/db/migrate.ts at deploy. Before this file, only
 * commerce_action_log existed (it self-creates in action-logger.ts) — the
 * other tables were queried but never created, which is why /channels
 * rendered a dead-end empty state (getSyncHealth threw on the missing
 * commerce_channel_connections and Promise.allSettled swallowed it) and
 * /schedule 404'd (no API route AND no skill_schedules table).
 *
 * Column shapes are extracted from the queries in apps/web/lib/commerce/**
 * — the code is the contract.
 */

/** Channel OAuth connections (shopify/amazon connectors; ON CONFLICT (merchant_id, platform)). */
export const COMMERCE_CHANNEL_CONNECTIONS_DDL = `
CREATE TABLE IF NOT EXISTS commerce_channel_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id             TEXT NOT NULL,
  platform                TEXT NOT NULL,
  shop_domain             TEXT,
  encrypted_access_token  TEXT,
  connected               BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at            TIMESTAMPTZ,
  error_count             INTEGER NOT NULL DEFAULT 0,
  rate_limit_status       TEXT NOT NULL DEFAULT 'ok',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commerce_channel_connections_merchant_platform_unique
    UNIQUE (merchant_id, platform)
);
`;

/** Skill automation schedules (scheduler.ts; ON CONFLICT (merchant_id, skill_name)). */
export const SKILL_SCHEDULES_DDL = `
CREATE TABLE IF NOT EXISTS skill_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      TEXT NOT NULL,
  skill_name       TEXT NOT NULL,
  cadence          TEXT NOT NULL,
  cron_expression  TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skill_schedules_merchant_skill_unique UNIQUE (merchant_id, skill_name)
);
`;

/** Inbound platform webhook receipts (webhooks/shopify + webhooks/amazon routes). */
export const COMMERCE_WEBHOOK_LOG_DDL = `
CREATE TABLE IF NOT EXISTS commerce_webhook_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL,
  topic         TEXT NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_size  INTEGER
);
`;

/** Product listings (dynamic repricer + listing optimizer read/update; rows arrive via channel sync). */
export const COMMERCE_LISTINGS_DDL = `
CREATE TABLE IF NOT EXISTS commerce_listings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             TEXT NOT NULL,
  channel            TEXT,
  title              TEXT,
  description        TEXT,
  bullets            JSONB,
  category           TEXT,
  keywords           JSONB,
  current_price      NUMERIC,
  last_repriced_at   TIMESTAMPTZ,
  last_optimized_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_listings_org
  ON commerce_listings (org_id, channel);
`;

/** Repricing rules per listing (skills/dynamic-repricer). */
export const COMMERCE_REPRICING_RULES_DDL = `
CREATE TABLE IF NOT EXISTS commerce_repricing_rules (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      TEXT NOT NULL,
  listing_id                  UUID,
  channel                     TEXT,
  floor_price                 NUMERIC,
  ceiling_price               NUMERIC,
  target_margin               NUMERIC,
  competitive_strategy        TEXT,
  price_adjustment_percent    NUMERIC,
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  first_activation_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_repricing_rules_org
  ON commerce_repricing_rules (org_id, is_active);
`;

/** Competitor price observations feeding the repricer. */
export const COMMERCE_COMPETITOR_PRICES_DDL = `
CREATE TABLE IF NOT EXISTS commerce_competitor_prices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID,
  competitor_price  NUMERIC,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_competitor_prices_listing
  ON commerce_competitor_prices (listing_id, recorded_at DESC);
`;

/** Per-org skill activation state (skill-activation-guard; ON CONFLICT (org_id, skill_id)). */
export const COMMERCE_SKILL_ACTIVATIONS_DDL = `
CREATE TABLE IF NOT EXISTS commerce_skill_activations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      TEXT NOT NULL,
  skill_id                    TEXT NOT NULL,
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_confirmation       BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_completed_at   TIMESTAMPTZ,
  confirmed_by_user_id        TEXT,
  activated_at                TIMESTAMPTZ,
  CONSTRAINT commerce_skill_activations_org_skill_unique UNIQUE (org_id, skill_id)
);
`;

/** Skill execution audit log (skill-executor). */
export const COMMERCE_SKILL_EXECUTION_LOGS_DDL = `
CREATE TABLE IF NOT EXISTS commerce_skill_execution_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             TEXT NOT NULL,
  skill_type         TEXT NOT NULL,
  entity_id          TEXT,
  result_json        JSONB,
  requires_approval  BOOLEAN NOT NULL DEFAULT FALSE,
  confidence         NUMERIC,
  executed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_skill_execution_logs_org
  ON commerce_skill_execution_logs (org_id, executed_at DESC);
`;

/** Autonomous action feed (dashboard-aggregator + action-reverter). */
export const COMMERCE_AUTONOMOUS_ACTIONS_DDL = `
CREATE TABLE IF NOT EXISTS commerce_autonomous_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        TEXT,
  action_type    TEXT,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'completed',
  minutes_saved  INTEGER,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_autonomous_actions_executed
  ON commerce_autonomous_actions (executed_at DESC);
`;

/**
 * Action log — action-logger.ts lazily self-creates this at runtime; the
 * shape below is copied VERBATIM from action-logger.ts so a fresh DB gets
 * the identical table at deploy (idempotent either way). If action-logger's
 * shape changes, change this in the same commit.
 */
export const COMMERCE_ACTION_LOG_DDL = `
CREATE TABLE IF NOT EXISTS commerce_action_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT        NOT NULL,
  skill       TEXT        NOT NULL,
  channel     TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  before_state JSONB      NOT NULL,
  after_state  JSONB      NOT NULL,
  executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reverted_at  TIMESTAMPTZ,
  reverted_by  TEXT,
  merchant_id  TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS commerce_action_log_merchant_time_idx
  ON commerce_action_log (merchant_id, executed_at DESC);
`;
