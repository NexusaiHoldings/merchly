"use client";

import React, { useState, useEffect, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";

type SkillId = "listing-optimizer" | "dynamic-repricer";
type ListingChannel = "shopify" | "amazon" | "ebay";
type CompetitiveStrategy = "match_lowest" | "beat_lowest" | "price_above_average";

interface ListingOptimizerConfig {
  channel: ListingChannel;
  toneGuardrails: string;
  approvalThreshold: number;
}

interface DynamicRepricerConfig {
  floorPrice: number;
  ceilingPrice: number;
  targetMargin: number;
  competitiveStrategy: CompetitiveStrategy;
  priceAdjustmentPercent: number;
}

type SkillConfig = ListingOptimizerConfig | DynamicRepricerConfig;

interface SkillMeta {
  id: SkillId;
  name: string;
  description: string;
  requiresConfirmationGate: boolean;
}

const SKILL_META: Record<string, SkillMeta> = {
  "listing-optimizer": {
    id: "listing-optimizer",
    name: "Listing Optimizer",
    description:
      "AI-driven title, description, and bullet-point rewrite per channel algorithm.",
    requiresConfirmationGate: false,
  },
  "dynamic-repricer": {
    id: "dynamic-repricer",
    name: "Dynamic Repricer",
    description:
      "Automated price adjustments with floor/ceiling guardrails and competitive positioning.",
    requiresConfirmationGate: true,
  },
};

const DEFAULT_LISTING_CONFIG: ListingOptimizerConfig = {
  channel: "shopify",
  toneGuardrails: "",
  approvalThreshold: 0.7,
};

const DEFAULT_REPRICER_CONFIG: DynamicRepricerConfig = {
  floorPrice: 0,
  ceilingPrice: 9999,
  targetMargin: 20,
  competitiveStrategy: "match_lowest",
  priceAdjustmentPercent: 5,
};

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <label
      style={{ display: "block", fontWeight: 500, fontSize: 13, color: "#374151", marginBottom: 4 }}
    >
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>{children}</p>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.5rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    color: "#111",
    background: "#fff",
    ...extra,
  };
}

function ConfirmationGateModal({
  skillName,
  onConfirm,
  onCancel,
}: {
  skillName: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-gate-title"
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2rem",
          maxWidth: 480,
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h2
          id="confirm-gate-title"
          style={{ margin: "0 0 1rem", fontSize: 18, fontWeight: 700, color: "#111" }}
        >
          Confirm Pricing Activation
        </h2>
        <p style={{ margin: "0 0 1rem", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
          <strong>{skillName}</strong> will autonomously adjust your product prices
          according to the rules below. This action requires explicit merchant
          confirmation before first activation.
        </p>
        <ul
          style={{
            margin: "0 0 1.5rem",
            paddingLeft: "1.25rem",
            fontSize: 13,
            color: "#374151",
            lineHeight: 1.8,
          }}
        >
          <li>Prices will not drop below your configured floor price</li>
          <li>Prices will not exceed your configured ceiling price</li>
          <li>All price changes are logged in the execution audit trail</li>
          <li>You can deactivate this skill at any time</li>
        </ul>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#fff",
              fontSize: 14,
              cursor: "pointer",
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1.25rem",
              border: "none",
              borderRadius: 6,
              background: "#dc2626",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            I understand — activate pricing
          </button>
        </div>
      </div>
    </div>
  );
}

function ListingOptimizerForm({
  config,
  onChange,
}: {
  config: ListingOptimizerConfig;
  onChange: (next: ListingOptimizerConfig) => void;
}): JSX.Element {
  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <Label>Sales Channel</Label>
        <select
          value={config.channel}
          onChange={(e) =>
            onChange({ ...config, channel: e.target.value as ListingChannel })
          }
          style={inputStyle()}
        >
          <option value="shopify">Shopify</option>
          <option value="amazon">Amazon</option>
          <option value="ebay">eBay</option>
        </select>
        <FieldHint>Channel algorithm determines title/description length limits.</FieldHint>
      </div>

      <div>
        <Label>Tone Guardrails</Label>
        <input
          type="text"
          placeholder="e.g. professional, no superlatives, avoid urgency language"
          value={config.toneGuardrails}
          onChange={(e) => onChange({ ...config, toneGuardrails: e.target.value })}
          style={inputStyle()}
        />
        <FieldHint>
          Comma-separated tone instructions injected into every optimization prompt.
        </FieldHint>
      </div>

      <div>
        <Label>
          Approval Threshold: {Math.round(config.approvalThreshold * 100)}%
        </Label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(config.approvalThreshold * 100)}
          onChange={(e) =>
            onChange({
              ...config,
              approvalThreshold: Number(e.target.value) / 100,
            })
          }
          style={{ width: "100%" }}
        />
        <FieldHint>
          AI confidence below this threshold queues the optimization for manual
          review before publishing. Lower = more automation. Higher = more oversight.
        </FieldHint>
      </div>
    </div>
  );
}

function DynamicRepricerForm({
  config,
  onChange,
}: {
  config: DynamicRepricerConfig;
  onChange: (next: DynamicRepricerConfig) => void;
}): JSX.Element {
  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <Label>Floor Price ($)</Label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={config.floorPrice}
            onChange={(e) =>
              onChange({ ...config, floorPrice: Number(e.target.value) })
            }
            style={inputStyle()}
          />
          <FieldHint>Price will never drop below this value.</FieldHint>
        </div>
        <div>
          <Label>Ceiling Price ($)</Label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={config.ceilingPrice}
            onChange={(e) =>
              onChange({ ...config, ceilingPrice: Number(e.target.value) })
            }
            style={inputStyle()}
          />
          <FieldHint>Price will never exceed this value.</FieldHint>
        </div>
      </div>

      <div>
        <Label>Target Margin (%)</Label>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={config.targetMargin}
          onChange={(e) =>
            onChange({ ...config, targetMargin: Number(e.target.value) })
          }
          style={inputStyle()}
        />
        <FieldHint>
          Minimum acceptable margin. Floor price takes precedence if margin
          constraint conflicts.
        </FieldHint>
      </div>

      <div>
        <Label>Competitive Strategy</Label>
        <select
          value={config.competitiveStrategy}
          onChange={(e) =>
            onChange({
              ...config,
              competitiveStrategy: e.target.value as CompetitiveStrategy,
            })
          }
          style={inputStyle()}
        >
          <option value="match_lowest">Match lowest competitor price</option>
          <option value="beat_lowest">Beat lowest competitor price</option>
          <option value="price_above_average">Price above competitor average</option>
        </select>
        <FieldHint>
          Determines how the skill positions your price relative to market data.
        </FieldHint>
      </div>

      <div>
        <Label>Price Adjustment (%)</Label>
        <input
          type="number"
          min={0}
          max={50}
          step={0.5}
          value={config.priceAdjustmentPercent}
          onChange={(e) =>
            onChange({
              ...config,
              priceAdjustmentPercent: Number(e.target.value),
            })
          }
          style={inputStyle()}
        />
        <FieldHint>
          Percentage offset applied for beat/above-average strategies.
          Ignored for match-lowest.
        </FieldHint>
      </div>
    </div>
  );
}

export default function ConfigurePage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const skillId = params?.skillId as string;

  const skill = SKILL_META[skillId] ?? null;

  const [listingConfig, setListingConfig] = useState<ListingOptimizerConfig>(
    DEFAULT_LISTING_CONFIG
  );
  const [repricerConfig, setRepricerConfig] = useState<DynamicRepricerConfig>(
    DEFAULT_REPRICER_CONFIG
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmGate, setShowConfirmGate] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    if (!skillId) return;
    fetch(`/api/commerce/skills/${encodeURIComponent(skillId)}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SkillConfig | null) => {
        if (!data) return;
        if (skillId === "listing-optimizer") {
          setListingConfig(data as ListingOptimizerConfig);
        } else if (skillId === "dynamic-repricer") {
          setRepricerConfig(data as DynamicRepricerConfig);
        }
      })
      .catch(() => {});
  }, [skillId]);

  function currentConfig(): SkillConfig {
    if (skillId === "listing-optimizer") return listingConfig;
    return repricerConfig;
  }

  async function persistConfig(confirmed: boolean): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/commerce/skills/${encodeURIComponent(skillId)}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: currentConfig(),
          confirmationGateCompleted: confirmed,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        throw new Error(body.error ?? `Server error ${resp.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
      setPendingSave(false);
    }
  }

  function handleSave(): void {
    if (skill?.requiresConfirmationGate) {
      setShowConfirmGate(true);
      setPendingSave(true);
    } else {
      void persistConfig(false);
    }
  }

  function handleConfirmGate(): void {
    setShowConfirmGate(false);
    void persistConfig(true);
  }

  function handleCancelGate(): void {
    setShowConfirmGate(false);
    setPendingSave(false);
  }

  if (!skill) {
    return (
      <main
        style={{
          maxWidth: 700,
          margin: "0 auto",
          padding: "2.5rem 1.5rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <p style={{ color: "#ef4444", fontSize: 15 }}>
          Skill not found: <code>{skillId}</code>
        </p>
        <button
          type="button"
          onClick={() => router.push("/skills")}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Back to skills
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: "2.5rem 1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      {showConfirmGate && (
        <ConfirmationGateModal
          skillName={skill.name}
          onConfirm={handleConfirmGate}
          onCancel={handleCancelGate}
        />
      )}

      <header style={{ marginBottom: "2rem" }}>
        <button
          type="button"
          onClick={() => router.push("/skills")}
          style={{
            background: "none",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            marginBottom: "1rem",
            display: "block",
          }}
        >
          ← Back to skills
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111" }}>
          Configure: {skill.name}
        </h1>
        <p style={{ marginTop: 6, color: "#555", fontSize: 14, lineHeight: 1.55 }}>
          {skill.description}
        </p>
        {skill.requiresConfirmationGate && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.6rem 0.9rem",
              background: "#fef3c7",
              borderRadius: 6,
              fontSize: 13,
              color: "#92400e",
              lineHeight: 1.5,
            }}
          >
            <strong>Confirmation required.</strong> First-time activation of this
            pricing skill requires explicit merchant confirmation to comply with
            autonomous action policy.
          </div>
        )}
      </header>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "1.75rem",
        }}
      >
        {skillId === "listing-optimizer" && (
          <ListingOptimizerForm config={listingConfig} onChange={setListingConfig} />
        )}
        {skillId === "dynamic-repricer" && (
          <DynamicRepricerForm config={repricerConfig} onChange={setRepricerConfig} />
        )}
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || pendingSave}
          style={{
            padding: "0.6rem 1.5rem",
            background: saving ? "#93c5fd" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>

        {saved && (
          <span style={{ fontSize: 13, color: "#059669", fontWeight: 500 }}>
            Configuration saved
          </span>
        )}

        {error && (
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        )}
      </div>
    </main>
  );
}
