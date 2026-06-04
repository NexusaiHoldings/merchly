/**
 * execute_channel_action — confirm-gated mutation tool handler.
 *
 * Writes a confirmed commerce action (price update, listing field change,
 * inventory quantity adjustment) to the target channel API and records the
 * before/after state in the immutable action log.
 *
 * Autonomy = confirm — mutations route through the cross-boundary bridge.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

type ActionType = "price_update" | "listing_field_change" | "inventory_adjustment";

interface ChannelActionArgs {
  action_id: string;
  channel: string;
  action_type: ActionType;
  target_id: string;
  payload: Record<string, unknown>;
  confirmation_token: string;
}

interface ActionLogEntry {
  action_id: string;
  channel: string;
  action_type: string;
  target_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown>;
  status: "success" | "failed";
  error_message: string | null;
  executed_at: string;
}

function parseArgs(args: Args): ChannelActionArgs {
  const {
    action_id,
    channel,
    action_type,
    target_id,
    payload,
    confirmation_token,
  } = args;

  if (typeof action_id !== "string" || !action_id) {
    throw new Error("action_id is required and must be a string");
  }
  if (typeof channel !== "string" || !channel) {
    throw new Error("channel is required and must be a string");
  }
  if (
    typeof action_type !== "string" ||
    !["price_update", "listing_field_change", "inventory_adjustment"].includes(action_type)
  ) {
    throw new Error(
      "action_type must be one of: price_update, listing_field_change, inventory_adjustment"
    );
  }
  if (typeof target_id !== "string" || !target_id) {
    throw new Error("target_id is required and must be a string");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("payload must be a non-null object");
  }
  if (typeof confirmation_token !== "string" || !confirmation_token) {
    throw new Error("confirmation_token is required and must be a string");
  }

  return {
    action_id,
    channel,
    action_type: action_type as ActionType,
    target_id,
    payload: payload as Record<string, unknown>,
    confirmation_token,
  };
}

async function verifyConfirmationToken(
  ctx: HandlerContext,
  actionId: string,
  confirmationToken: string
): Promise<boolean> {
  const rows = await ctx.db.query<{ confirmation_token: string; consumed: boolean }>(
    `SELECT confirmation_token, consumed
     FROM agent_action_confirmations
     WHERE action_id = $1
       AND consumed = false
       AND expires_at > NOW()
     LIMIT 1`,
    actionId
  );

  const row = rows[0];
  if (!row) return false;
  return row.confirmation_token === confirmationToken;
}

async function markConfirmationConsumed(
  ctx: HandlerContext,
  actionId: string
): Promise<void> {
  await ctx.db.execute(
    `UPDATE agent_action_confirmations
     SET consumed = true, consumed_at = NOW()
     WHERE action_id = $1`,
    actionId
  );
}

async function fetchBeforeState(
  ctx: HandlerContext,
  channel: string,
  actionType: ActionType,
  targetId: string
): Promise<Record<string, unknown> | null> {
  const rows = await ctx.db.query<{ snapshot: Record<string, unknown> }>(
    `SELECT snapshot
     FROM channel_resource_snapshots
     WHERE channel = $1
       AND action_type = $2
       AND target_id = $3
     ORDER BY snapshotted_at DESC
     LIMIT 1`,
    channel,
    actionType,
    targetId
  );
  return rows[0]?.snapshot ?? null;
}

async function dispatchToChannelBridge(
  channel: string,
  actionType: ActionType,
  targetId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const bridgeUrl = process.env.CHANNEL_BRIDGE_URL;
  if (!bridgeUrl) {
    throw new Error("CHANNEL_BRIDGE_URL environment variable is not set");
  }

  const bridgeApiKey = process.env.CHANNEL_BRIDGE_API_KEY;
  if (!bridgeApiKey) {
    throw new Error("CHANNEL_BRIDGE_API_KEY environment variable is not set");
  }

  const response = await fetch(`${bridgeUrl}/v1/channels/${encodeURIComponent(channel)}/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bridgeApiKey}`,
    },
    body: JSON.stringify({
      action_type: actionType,
      target_id: targetId,
      payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Channel bridge returned ${response.status}: ${errorText}`
    );
  }

  const result = (await response.json()) as Record<string, unknown>;
  return result;
}

async function recordActionLog(
  ctx: HandlerContext,
  entry: ActionLogEntry
): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO agent_action_log (
       action_id, channel, action_type, target_id,
       before_state, after_state, status, error_message, executed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (action_id) DO UPDATE
       SET status       = EXCLUDED.status,
           after_state  = EXCLUDED.after_state,
           error_message = EXCLUDED.error_message,
           executed_at  = EXCLUDED.executed_at`,
    entry.action_id,
    entry.channel,
    entry.action_type,
    entry.target_id,
    entry.before_state ? JSON.stringify(entry.before_state) : null,
    JSON.stringify(entry.after_state),
    entry.status,
    entry.error_message,
    entry.executed_at
  );
}

export async function handleExecuteChannelAction(
  ctx: HandlerContext,
  args: Args
): Promise<HandlerResult> {
  let parsed: ChannelActionArgs;
  try {
    parsed = parseArgs(args);
  } catch (validationError) {
    return {
      status: 400,
      body: validationError instanceof Error
        ? validationError.message
        : "Invalid arguments",
    };
  }

  const { action_id, channel, action_type, target_id, payload, confirmation_token } = parsed;

  const tokenValid = await verifyConfirmationToken(ctx, action_id, confirmation_token);
  if (!tokenValid) {
    return {
      status: 403,
      body: "Invalid or expired confirmation token — action not executed",
    };
  }

  const beforeState = await fetchBeforeState(ctx, channel, action_type, target_id);

  let afterState: Record<string, unknown>;
  let bridgeError: string | null = null;

  try {
    afterState = await dispatchToChannelBridge(channel, action_type, target_id, payload);
  } catch (dispatchErr) {
    bridgeError = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);

    await recordActionLog(ctx, {
      action_id,
      channel,
      action_type,
      target_id,
      before_state: beforeState,
      after_state: {},
      status: "failed",
      error_message: bridgeError,
      executed_at: new Date().toISOString(),
    });

    await ctx.events.publish("agent.channel_action.failed", {
      action_id,
      channel,
      action_type,
      target_id,
      error: bridgeError,
    });

    return {
      status: 502,
      body: `Channel bridge error: ${bridgeError}`,
    };
  }

  await markConfirmationConsumed(ctx, action_id);

  const executedAt = new Date().toISOString();

  await recordActionLog(ctx, {
    action_id,
    channel,
    action_type,
    target_id,
    before_state: beforeState,
    after_state: afterState,
    status: "success",
    error_message: null,
    executed_at: executedAt,
  });

  await ctx.events.publish("agent.channel_action.executed", {
    action_id,
    channel,
    action_type,
    target_id,
    executed_at: executedAt,
  });

  return {
    status: 200,
    body: {
      action_id,
      channel,
      action_type,
      target_id,
      before_state: beforeState,
      after_state: afterState,
      executed_at: executedAt,
    },
  };
}
