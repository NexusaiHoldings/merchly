import React from "react";
import Link from "next/link";
import { SKILL_CATALOG, type SkillDefinition } from "@/lib/commerce/skill-executor";
import { getAllActivationRecords, type ActivationRecord } from "@/lib/commerce/skill-activation-guard";

export const dynamic = "force-dynamic";

function SkillStatusBadge({
  record,
  skill,
}: {
  record: ActivationRecord | undefined;
  skill: SkillDefinition;
}): React.JSX.Element {
  if (!record || !record.isActive) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 20,
          background: "#f3f4f6",
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Inactive
      </span>
    );
  }

  if (skill.requiresConfirmationGate && !record.confirmationCompletedAt) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 20,
          background: "#fef3c7",
          color: "#92400e",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Pending confirmation
      </span>
    );
  }

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 20,
        background: "#d1fae5",
        color: "#065f46",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      Active
    </span>
  );
}

export default async function SkillsPage(): Promise<React.JSX.Element> {
  const orgId = process.env.DEFAULT_ORG_ID ?? "";

  let activationRecords: ActivationRecord[] = [];
  if (orgId) {
    activationRecords = await getAllActivationRecords(orgId).catch(() => []);
  }

  const recordMap = new Map<string, ActivationRecord>(
    activationRecords.map((r) => [r.skillId, r])
  );

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "2.5rem 1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#111" }}>
          AI Skill Bundles
        </h1>
        <p style={{ marginTop: 8, color: "#555", fontSize: 15, lineHeight: 1.55 }}>
          Pre-loaded skills that produce autonomous commerce actions on day one.
          Each skill executes against your connected channel data with configurable
          guardrails.
        </p>
      </header>

      <div style={{ display: "grid", gap: "1.25rem" }}>
        {SKILL_CATALOG.map((skill) => {
          const record = recordMap.get(skill.id);
          return (
            <div
              key={skill.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "1.5rem",
                background: "#fff",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "1.5rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{ fontWeight: 600, fontSize: 16, color: "#111" }}
                  >
                    {skill.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: skill.category === "pricing" ? "#ede9fe" : "#e0f2fe",
                      color: skill.category === "pricing" ? "#5b21b6" : "#0369a1",
                      textTransform: "capitalize",
                    }}
                  >
                    {skill.category}
                  </span>
                  {skill.requiresConfirmationGate && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: "#fef9c3",
                        color: "#713f12",
                      }}
                    >
                      Requires confirmation
                    </span>
                  )}
                  <SkillStatusBadge record={record} skill={skill} />
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "#555",
                    lineHeight: 1.6,
                  }}
                >
                  {skill.description}
                </p>

                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>
                  Cadence: {skill.cadence}
                </p>

                {record?.activatedAt && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                    Activated:{" "}
                    {new Date(record.activatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>

              <div style={{ flexShrink: 0 }}>
                <Link
                  href={`/skills/${skill.id}/configure`}
                  style={{
                    display: "inline-block",
                    padding: "0.5rem 1.125rem",
                    background: "#2563eb",
                    color: "#fff",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Configure
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <footer
        style={{
          marginTop: "2.5rem",
          padding: "1.25rem",
          background: "#f9fafb",
          borderRadius: 8,
          fontSize: 13,
          color: "#6b7280",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "#374151" }}>Day-1 revenue bundles.</strong>{" "}
        Listing Optimizer and Dynamic Repricer are the two pre-loaded skills
        required for autonomous commerce. Connect your Shopify or Amazon channel
        then configure each skill{"'"}s guardrails before enabling.
      </footer>
    </main>
  );
}
