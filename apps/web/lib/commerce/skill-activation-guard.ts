import { buildDb } from "@/lib/db";

export interface ActivationRecord {
  skillId: string;
  orgId: string;
  isActive: boolean;
  activatedAt: string | null;
  requiresConfirmation: boolean;
  confirmationCompletedAt: string | null;
  confirmedByUserId: string | null;
}

export interface ActivationGuardResult {
  allowed: boolean;
  requiresConfirmationGate: boolean;
  reason: string;
}

const PRICING_SKILLS = new Set(["dynamic-repricer"]);

export async function checkActivationAllowed(
  orgId: string,
  skillId: string
): Promise<ActivationGuardResult> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT is_active, requires_confirmation, confirmation_completed_at" +
      " FROM commerce_skill_activations" +
      " WHERE org_id = $1 AND skill_id = $2",
    orgId,
    skillId
  );

  if (rows.length === 0) {
    const isPricingSkill = PRICING_SKILLS.has(skillId);
    return {
      allowed: !isPricingSkill,
      requiresConfirmationGate: isPricingSkill,
      reason: isPricingSkill
        ? "First-time pricing rule activation requires merchant confirmation" +
          " — liability_assessor human_in_loop gate enforced"
        : "No prior activation record; proceeding for non-pricing skill",
    };
  }

  const record = rows[0];
  const requiresConfirmation = Boolean(record.requires_confirmation);
  const confirmationDone = Boolean(record.confirmation_completed_at);

  if (requiresConfirmation && !confirmationDone) {
    return {
      allowed: false,
      requiresConfirmationGate: true,
      reason:
        "Pricing skill confirmation gate has not been completed." +
        " Merchant must explicitly confirm before autonomous pricing actions begin.",
    };
  }

  return {
    allowed: true,
    requiresConfirmationGate: false,
    reason: "Activation allowed; confirmation gate satisfied",
  };
}

export async function recordActivationConfirmation(
  orgId: string,
  skillId: string,
  confirmedByUserId: string
): Promise<void> {
  const db = buildDb();
  await db.execute(
    "INSERT INTO commerce_skill_activations" +
      " (id, org_id, skill_id, is_active, requires_confirmation," +
      " confirmation_completed_at, confirmed_by_user_id, activated_at)" +
      " VALUES (gen_random_uuid(), $1, $2, true, $3, NOW(), $4, NOW())" +
      " ON CONFLICT (org_id, skill_id) DO UPDATE SET" +
      " is_active = true, confirmation_completed_at = NOW()," +
      " confirmed_by_user_id = $4",
    orgId,
    skillId,
    PRICING_SKILLS.has(skillId),
    confirmedByUserId
  );
}

export async function activateSkill(
  orgId: string,
  skillId: string,
  userId: string
): Promise<void> {
  const isPricingSkill = PRICING_SKILLS.has(skillId);
  const db = buildDb();

  await db.execute(
    "INSERT INTO commerce_skill_activations" +
      " (id, org_id, skill_id, is_active, requires_confirmation," +
      " confirmation_completed_at, confirmed_by_user_id, activated_at)" +
      " VALUES (gen_random_uuid(), $1, $2, true, $3, $4, $5, NOW())" +
      " ON CONFLICT (org_id, skill_id) DO UPDATE SET" +
      " is_active = true, activated_at = NOW(), confirmed_by_user_id = $5",
    orgId,
    skillId,
    isPricingSkill,
    isPricingSkill ? null : new Date().toISOString(),
    userId
  );
}

export async function deactivateSkill(orgId: string, skillId: string): Promise<void> {
  const db = buildDb();
  await db.execute(
    "UPDATE commerce_skill_activations SET is_active = false WHERE org_id = $1 AND skill_id = $2",
    orgId,
    skillId
  );
}

export async function getActivationRecord(
  orgId: string,
  skillId: string
): Promise<ActivationRecord | null> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT skill_id, org_id, is_active, activated_at," +
      " requires_confirmation, confirmation_completed_at, confirmed_by_user_id" +
      " FROM commerce_skill_activations" +
      " WHERE org_id = $1 AND skill_id = $2",
    orgId,
    skillId
  );

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    skillId: String(r.skill_id),
    orgId: String(r.org_id),
    isActive: Boolean(r.is_active),
    activatedAt: r.activated_at ? String(r.activated_at) : null,
    requiresConfirmation: Boolean(r.requires_confirmation),
    confirmationCompletedAt: r.confirmation_completed_at
      ? String(r.confirmation_completed_at)
      : null,
    confirmedByUserId: r.confirmed_by_user_id ? String(r.confirmed_by_user_id) : null,
  };
}

export async function getAllActivationRecords(
  orgId: string
): Promise<ActivationRecord[]> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT skill_id, org_id, is_active, activated_at," +
      " requires_confirmation, confirmation_completed_at, confirmed_by_user_id" +
      " FROM commerce_skill_activations" +
      " WHERE org_id = $1",
    orgId
  );

  return rows.map((r) => ({
    skillId: String(r.skill_id),
    orgId: String(r.org_id),
    isActive: Boolean(r.is_active),
    activatedAt: r.activated_at ? String(r.activated_at) : null,
    requiresConfirmation: Boolean(r.requires_confirmation),
    confirmationCompletedAt: r.confirmation_completed_at
      ? String(r.confirmation_completed_at)
      : null,
    confirmedByUserId: r.confirmed_by_user_id ? String(r.confirmed_by_user_id) : null,
  }));
}
