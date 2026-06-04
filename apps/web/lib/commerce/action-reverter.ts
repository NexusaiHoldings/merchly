/**
 * Commerce action reverter — creates a compensating log entry that swaps
 * before/after state and marks the original action as reverted.
 *
 * The revert is itself logged so the audit trail remains complete and
 * immutable: nothing is ever deleted, only compensated.
 */

import {
  getActionById,
  logAction,
  markReverted,
  type ActionLogEntry,
} from "./action-logger";

export interface RevertResult {
  success: boolean;
  compensatingActionId: string | null;
  error?: string;
}

export async function revertAction(
  actionId: string,
  revertedBy: string
): Promise<RevertResult> {
  const original = await getActionById(actionId);

  if (!original) {
    return {
      success: false,
      compensatingActionId: null,
      error: "Action not found",
    };
  }

  if (original.revertedAt !== null) {
    return {
      success: false,
      compensatingActionId: null,
      error: "Action has already been reverted",
    };
  }

  if (original.actionType.startsWith("revert:")) {
    return {
      success: false,
      compensatingActionId: null,
      error: "Compensating actions cannot themselves be reverted",
    };
  }

  try {
    const compensating = await logAction({
      actionType: `revert:${original.actionType}`,
      skill: "manual-revert",
      channel: original.channel,
      entityId: original.entityId,
      entityType: original.entityType,
      beforeState: original.afterState,
      afterState: original.beforeState,
      merchantId: original.merchantId,
    });

    await markReverted(actionId, revertedBy);

    return { success: true, compensatingActionId: compensating.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, compensatingActionId: null, error: message };
  }
}

export function canRevert(action: ActionLogEntry): boolean {
  return (
    action.revertedAt === null && !action.actionType.startsWith("revert:")
  );
}
