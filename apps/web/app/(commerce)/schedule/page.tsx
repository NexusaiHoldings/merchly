"use client";

/**
 * /schedule — Skill Scheduling Engine UI
 *
 * Lets merchants configure when each skill runs. Supports 5 cadence options:
 *   1. Hourly    — e.g. repricing
 *   2. Daily     — e.g. morning digest
 *   3. Nightly   — e.g. inventory reconciliation
 *   4. Weekly    — e.g. listing audits
 *   5. Custom    — arbitrary cron expression
 *
 * Server-side data loading happens via the /api/commerce/schedules route.
 * This component is a client component so merchants can interact with the
 * cadence selector and toggle switches without a full page reload.
 */

import { useState, useEffect, useCallback } from "react";
import type { CadenceType, SkillSchedule } from "@/lib/commerce/scheduler";

interface CadenceOption {
  value: CadenceType;
  label: string;
  description: string;
  cronExpression: string | null;
}

const CADENCE_OPTIONS: CadenceOption[] = [
  {
    value: "hourly",
    label: "Hourly",
    description: "Run every hour — ideal for real-time repricing.",
    cronExpression: "0 * * * *",
  },
  {
    value: "daily",
    label: "Daily (8 AM UTC)",
    description: "Run once per day — great for morning digest reports.",
    cronExpression: "0 8 * * *",
  },
  {
    value: "nightly",
    label: "Nightly (2 AM UTC)",
    description: "Run every night — standard for inventory reconciliation.",
    cronExpression: "0 2 * * *",
  },
  {
    value: "weekly",
    label: "Weekly (Sun 3 AM UTC)",
    description: "Run once per week — fits comprehensive listing audits.",
    cronExpression: "0 3 * * 0",
  },
  {
    value: "custom",
    label: "Custom cron",
    description: "Enter your own cron expression for precise scheduling.",
    cronExpression: null,
  },
];

const AVAILABLE_SKILLS = [
  { name: "repricing", label: "Repricing Engine", defaultCadence: "hourly" as CadenceType },
  { name: "inventory-reconciliation", label: "Inventory Reconciliation", defaultCadence: "nightly" as CadenceType },
  { name: "listing-audit", label: "Listing Audit", defaultCadence: "weekly" as CadenceType },
  { name: "daily-digest", label: "Daily Digest", defaultCadence: "daily" as CadenceType },
  { name: "pii-purge", label: "PII Purge", defaultCadence: "nightly" as CadenceType },
];

interface ScheduleFormState {
  cadence: CadenceType;
  customCron: string;
  enabled: boolean;
}

interface ScheduleCardProps {
  skill: { name: string; label: string; defaultCadence: CadenceType };
  schedule: SkillSchedule | undefined;
  onSave: (skillName: string, form: ScheduleFormState) => Promise<void>;
  onToggle: (scheduleId: string, enabled: boolean) => Promise<void>;
  saving: boolean;
}

function ScheduleCard({ skill, schedule, onSave, onToggle, saving }: ScheduleCardProps) {
  const [form, setForm] = useState<ScheduleFormState>({
    cadence: schedule?.cadence ?? skill.defaultCadence,
    customCron: schedule?.cadence === "custom" ? (schedule.cron_expression ?? "") : "",
    enabled: schedule?.enabled ?? true,
  });
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCadenceChange = (cadence: CadenceType) => {
    setForm((prev) => ({ ...prev, cadence }));
    setError(null);
  };

  const handleSave = async () => {
    if (form.cadence === "custom" && !form.customCron.trim()) {
      setError("Please enter a cron expression.");
      return;
    }
    setLocalSaving(true);
    setError(null);
    try {
      await onSave(skill.name, form);
    } catch (err) {
      setError((err as Error).message ?? "Failed to save schedule.");
    } finally {
      setLocalSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!schedule) return;
    setLocalSaving(true);
    try {
      await onToggle(schedule.id, !schedule.enabled);
      setForm((prev) => ({ ...prev, enabled: !prev.enabled }));
    } catch (err) {
      setError((err as Error).message ?? "Failed to toggle.");
    } finally {
      setLocalSaving(false);
    }
  };

  const isBusy = saving || localSaving;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "16px",
        background: "#fff",
        opacity: isBusy ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{skill.label}</h3>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
            Skill: <code>{skill.name}</code>
          </p>
        </div>
        {schedule && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={handleToggle}
              disabled={isBusy}
              style={{ width: "16px", height: "16px" }}
            />
            <span style={{ fontSize: "14px", color: "#374151" }}>
              {schedule.enabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        )}
      </div>

      {schedule && (
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
          {schedule.last_run_at
            ? `Last run: ${new Date(schedule.last_run_at).toLocaleString()}`
            : "Never run"}
          {schedule.next_run_at && (
            <> &mdash; Next: {new Date(schedule.next_run_at).toLocaleString()}</>
          )}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        {CADENCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              cursor: "pointer",
              padding: "10px",
              borderRadius: "6px",
              background: form.cadence === opt.value ? "#eff6ff" : "#f9fafb",
              border: form.cadence === opt.value ? "1px solid #3b82f6" : "1px solid transparent",
            }}
          >
            <input
              type="radio"
              name={`cadence-${skill.name}`}
              value={opt.value}
              checked={form.cadence === opt.value}
              onChange={() => handleCadenceChange(opt.value)}
              disabled={isBusy}
              style={{ marginTop: "2px" }}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: "14px" }}>
                {opt.label}
                {opt.cronExpression && (
                  <code
                    style={{
                      marginLeft: "8px",
                      fontSize: "11px",
                      background: "#f3f4f6",
                      padding: "1px 5px",
                      borderRadius: "4px",
                      color: "#374151",
                    }}
                  >
                    {opt.cronExpression}
                  </code>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>{opt.description}</div>
            </div>
          </label>
        ))}
      </div>

      {form.cadence === "custom" && (
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "4px" }}>
            Cron expression
          </label>
          <input
            type="text"
            value={form.customCron}
            onChange={(e) => setForm((prev) => ({ ...prev, customCron: e.target.value }))}
            placeholder="e.g. 30 4 * * 1-5"
            disabled={isBusy}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: "14px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
            Standard 5-field cron (minute hour dom month dow). UTC timezone.
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "8px" }}>{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={isBusy}
        style={{
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "8px 16px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: isBusy ? "not-allowed" : "pointer",
          opacity: isBusy ? 0.6 : 1,
        }}
      >
        {localSaving ? "Saving…" : schedule ? "Update Schedule" : "Save Schedule"}
      </button>
    </div>
  );
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<SkillSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/commerce/schedules");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { schedules: SkillSchedule[] };
      setSchedules(data.schedules ?? []);
    } catch (err) {
      setGlobalError((err as Error).message ?? "Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleSave = useCallback(async (skillName: string, form: ScheduleFormState) => {
    setSaving(true);
    try {
      const res = await fetch("/api/commerce/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_name: skillName,
          cadence: form.cadence,
          custom_cron: form.customCron || undefined,
          enabled: form.enabled,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await loadSchedules();
    } finally {
      setSaving(false);
    }
  }, [loadSchedules]);

  const handleToggle = useCallback(async (scheduleId: string, enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/commerce/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await loadSchedules();
    } finally {
      setSaving(false);
    }
  }, [loadSchedules]);

  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px" }}>
          Skill Scheduling Engine
        </h1>
        <p style={{ color: "#6b7280", fontSize: "15px", margin: 0 }}>
          Configure when each automated skill runs. Choose from 5 cadence options
          — hourly, daily, nightly, weekly, or a custom cron expression — so your
          store runs around the clock without manual intervention.
        </p>
      </div>

      {loading && (
        <p style={{ color: "#6b7280" }}>Loading schedules…</p>
      )}

      {globalError && !loading && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#dc2626",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          {globalError}
        </div>
      )}

      {!loading && AVAILABLE_SKILLS.map((skill) => {
        const schedule = schedules.find((s) => s.skill_name === skill.name);
        return (
          <ScheduleCard
            key={skill.name}
            skill={skill}
            schedule={schedule}
            onSave={handleSave}
            onToggle={handleToggle}
            saving={saving}
          />
        );
      })}

      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#166534",
        }}
      >
        <strong>About cadences:</strong> Schedules are executed by Vercel Cron.
        Hourly repricing fires every full hour. Nightly inventory reconciliation
        runs at 02:00 UTC. Weekly listing audits fire Sunday at 03:00 UTC. Daily
        digest fires at 08:00 UTC. Custom expressions follow standard 5-field
        cron syntax (UTC).
      </div>
    </main>
  );
}
