/**
 * Commerce Channel Connector — base types and connector registry.
 *
 * All platform connectors implement ChannelConnector. The registry maps
 * platform slugs to connector instances, isolating platform-specific logic
 * from skill execution code so future channels (eBay, Etsy) can be added
 * without touching the calling code.
 */

export type Platform = "shopify" | "amazon";

export type RateLimitStatus = "ok" | "warning" | "exceeded";

export interface SyncHealth {
  connected: boolean;
  lastSyncAt: string | null;
  errorCount: number;
  rateLimitStatus: RateLimitStatus;
  platform: Platform;
  displayName: string;
}

export interface ChannelConnection {
  id: string;
  merchantId: string;
  platform: Platform;
  shopDomain: string | null;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  errorCount: number;
  rateLimitStatus: RateLimitStatus;
}

export interface ChannelConnector {
  readonly platform: Platform;
  readonly displayName: string;
  oauthUrl(state: string, shopDomain?: string): string;
  exchangeToken(code: string, shopDomain?: string): Promise<string>;
  saveConnection(merchantId: string, accessToken: string, shopDomain?: string): Promise<void>;
  removeConnection(merchantId: string): Promise<void>;
  getSyncHealth(merchantId: string): Promise<SyncHealth>;
  handleWebhook(payload: string, signature: string, topic: string): Promise<void>;
  recordSyncAttempt(merchantId: string, success: boolean): Promise<void>;
}

const _registry = new Map<Platform, ChannelConnector>();

export function registerConnector(connector: ChannelConnector): void {
  _registry.set(connector.platform, connector);
}

export function getConnector(platform: string): ChannelConnector | null {
  return _registry.get(platform as Platform) ?? null;
}

export function listConnectors(): ChannelConnector[] {
  return Array.from(_registry.values());
}

/** Shared lazy pg pool — one pool per process, shared across connectors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sharedPool: any = null;

function getSharedPool(): {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_sharedPool) return _sharedPool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _sharedPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _sharedPool;
}

export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[]
): Promise<T[]> {
  const pool = getSharedPool();
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function dbExecute(sql: string, params: unknown[]): Promise<void> {
  const pool = getSharedPool();
  await pool.query(sql, params);
}
