/**
 * sync_inventory_across_channels — confirm-gated mutation tool handler.
 *
 * Propagates an inventory quantity update from the source channel (where a
 * sale occurred) to all other connected channels for the same SKU, writing
 * the updated quantity via each channel's API and logging the sync event.
 *
 * Autonomy = autonomous for analysis; mutations route through the
 * cross-boundary bridge (confirm-gated).
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

interface SyncInventoryArgs {
  sync_id: string;
  sku: string;
  source_channel: string;
  new_quantity: number;
  confirmation_token: string;
}

interface ChannelSyncResult {
  channel: string;
  status: "success" | "failed";
  error_message: string | null;
  synced_at: string;
}

interface SyncLogEntry {
  sync_id: string;
  sku: string;
  source_channel: string;
  new_quantity: number;
  channels_synced: ChannelSyncResult[];
  overall_status: "success" | "partial" | "failed";
  executed_at: string;
}

function parseArgs(args: Args): SyncInventoryArgs {
  const { sync_id, sku, source_channel, new_quantity, confirmation_token } = args;

  if (typeof sync_id !== "string" || !sync_id) {
    throw new Error("sync_id is required and must be a string");
  }
  if (typeof sku !== "string" || !sku) {
    throw new Error("sku is required and must be a string");
  }
  if (typeof source_channel !== "string" || !source_channel) {
    throw new Error("source_channel is required and must be a string");
  }
  if (typeof new_quantity !== "number" || !Number.isInteger(new_quantity) || new_quantity < 0) {
    throw new Error("new_quantity must be a non-negative integer");
  }
  if (typeof confirmation_token !== "string" || !confirmation_token) {
    throw new Error("confirmation_token is required and must be a string");
  }

  return {
    sync_id,
    sku,
    source_channel,
    new_quantity,
    confirmation_token,
  };
}

async function verifyConfirmationToken(
  ctx: HandlerContext,
  syncId: string,
  confirmationToken: string
): Promise<boolean> {
  const rows = await ctx.db.query<{ confirmation_token: string; consumed: boolean }>(
    `SELECT confirmation_token, consumed
     FROM agent_action_confirmations
     WHERE action_id = $1
       AND consumed = false
       AND expires_at > NOW()
     LIMIT 1`,
    syncId
  );

  const row = rows[0];
  if (!row) return false;
  return row.confirmation_token === confirmationToken;
}

async function markConfirmationConsumed(
  ctx: HandlerContext,
  syncId: string
): Promise<void> {
  await ctx.db.execute(
    `UPDATE agent_action_confirmations
     SET consumed = true, consumed_at = NOW()
     WHERE action_id = $1`,
    syncId
  );
}

async function fetchConnectedChannels(
  ctx: HandlerContext,
  sku: string,
  sourceChannel: string
): Promise<string[]> {
  const rows = await ctx.db.query<{ channel: string }>(
    `SELECT DISTINCT cc.channel
     FROM channel_connections cc
     JOIN channel_listings cl ON cl.channel = cc.channel
     WHERE cl.sku = $1
       AND cc.channel <> $2
       AND cc.active = true
     ORDER BY cc.channel`,
    sku,
    sourceChannel
  );
  return rows.map((r) => r.channel);
}

async function pushInventoryToChannel(
  channel: string,
  sku: string,
  newQuantity: number
): Promise<void> {
  const bridgeUrl = process.env.CHANNEL_BRIDGE_URL;
  if (!bridgeUrl) {
    throw new Error("CHANNEL_BRIDGE_URL environment variable is not set");
  }

  const bridgeApiKey = process.env.CHANNEL_BRIDGE_API_KEY;
  if (!bridgeApiKey) {
    throw new Error("CHANNEL_BRIDGE_API_KEY environment variable is not set");
  }

  const response = await fetch(
    `${bridgeUrl}/v1/channels/${encodeURIComponent(channel)}/inventory`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bridgeApiKey}`,
      },
      body: JSON.stringify({ sku, quantity: newQuantity }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Channel bridge returned ${response.status}: ${errorText}`);
  }
}

async function recordSyncLog(
  ctx: HandlerContext,
  entry: SyncLogEntry
): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO inventory_sync_log (
       sync_id, sku, source_channel, new_quantity,
       channels_synced, overall_status, executed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (sync_id) DO UPDATE
       SET channels_synced  = EXCLUDED.channels_synced,
           overall_status   = EXCLUDED.overall_status,
           executed_at      = EXCLUDED.executed_at`,
    entry.sync_id,
    entry.sku,
    entry.source_channel,
    entry.new_quantity,
    JSON.stringify(entry.channels_synced),
    entry.overall_status,
    entry.executed_at
  );
}

export async function handleSyncInventoryAcrossChannels(
  ctx: HandlerContext,
  args: Args
): Promise<HandlerResult> {
  let parsed: SyncInventoryArgs;
  try {
    parsed = parseArgs(args);
  } catch (validationError) {
    return {
      status: 400,
      body:
        validationError instanceof Error
          ? validationError.message
          : "Invalid arguments",
    };
  }

  const { sync_id, sku, source_channel, new_quantity, confirmation_token } = parsed;

  const tokenValid = await verifyConfirmationToken(ctx, sync_id, confirmation_token);
  if (!tokenValid) {
    return {
      status: 403,
      body: "Invalid or expired confirmation token — sync not executed",
    };
  }

  let targetChannels: string[];
  try {
    targetChannels = await fetchConnectedChannels(ctx, sku, source_channel);
  } catch (fetchErr) {
    return {
      status: 502,
      body: `Failed to fetch connected channels: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
    };
  }

  if (targetChannels.length === 0) {
    await markConfirmationConsumed(ctx, sync_id);
    const executedAt = new Date().toISOString();
    await recordSyncLog(ctx, {
      sync_id,
      sku,
      source_channel,
      new_quantity,
      channels_synced: [],
      overall_status: "success",
      executed_at: executedAt,
    });
    return {
      status: 200,
      body: {
        sync_id,
        sku,
        source_channel,
        new_quantity,
        channels_synced: [],
        overall_status: "success",
        message: "No connected channels found for this SKU — nothing to sync",
        executed_at: executedAt,
      },
    };
  }

  const results: ChannelSyncResult[] = await Promise.all(
    targetChannels.map(async (channel): Promise<ChannelSyncResult> => {
      const syncedAt = new Date().toISOString();
      try {
        await pushInventoryToChannel(channel, sku, new_quantity);
        return { channel, status: "success", error_message: null, synced_at: syncedAt };
      } catch (pushErr) {
        return {
          channel,
          status: "failed",
          error_message: pushErr instanceof Error ? pushErr.message : String(pushErr),
          synced_at: syncedAt,
        };
      }
    })
  );

  const successCount = results.filter((r) => r.status === "success").length;
  const failureCount = results.filter((r) => r.status === "failed").length;

  let overallStatus: "success" | "partial" | "failed";
  if (failureCount === 0) {
    overallStatus = "success";
  } else if (successCount === 0) {
    overallStatus = "failed";
  } else {
    overallStatus = "partial";
  }

  await markConfirmationConsumed(ctx, sync_id);

  const executedAt = new Date().toISOString();

  await recordSyncLog(ctx, {
    sync_id,
    sku,
    source_channel,
    new_quantity,
    channels_synced: results,
    overall_status: overallStatus,
    executed_at: executedAt,
  });

  await ctx.events.publish("agent.inventory_sync.completed", {
    sync_id,
    sku,
    source_channel,
    new_quantity,
    overall_status: overallStatus,
    channels_synced: results,
    executed_at: executedAt,
  });

  const httpStatus = overallStatus === "failed" ? 502 : 200;

  return {
    status: httpStatus,
    body: {
      sync_id,
      sku,
      source_channel,
      new_quantity,
      channels_synced: results,
      overall_status: overallStatus,
      executed_at: executedAt,
    },
  };
}
