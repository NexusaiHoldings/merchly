/**
 * Action detail page — shows the full before/after state for a single
 * AI-executed commerce action and provides a one-click revert control.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActionById } from "@/lib/commerce/action-logger";
import { revertAction, canRevert } from "@/lib/commerce/action-reverter";

interface PageProps {
  params: { actionId: string };
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function StateBlock({
  label,
  state,
}: {
  label: string;
  state: Record<string, unknown>;
}): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.625rem 1rem",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          fontWeight: 600,
          fontSize: "0.875rem",
          color: "#374151",
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "1rem",
          fontSize: "0.8125rem",
          overflowX: "auto",
          background: "#fff",
          color: "#1f2937",
          lineHeight: 1.6,
        }}
      >
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
}

export default async function ActionDetailPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const action = await getActionById(params.actionId);
  if (!action) notFound();

  const revertable = canRevert(action);

  async function handleRevert(): Promise<void> {
    "use server";
    const result = await revertAction(params.actionId, "merchant");
    if (result.success) {
      redirect("/actions");
    } else {
      redirect(`/actions/${params.actionId}?error=${encodeURIComponent(result.error ?? "Revert failed")}`);
    }
  }

  return (
    <section
      style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}
    >
      <nav style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/actions"
          style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.875rem" }}
        >
          ← Back to Action Log
        </Link>
      </nav>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {action.actionType}
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              color: "#6b7280",
              fontSize: "0.875rem",
            }}
          >
            {formatDate(action.executedAt)}
          </p>
        </div>

        {revertable && (
          <form action={handleRevert}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1.25rem",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Revert this action
            </button>
          </form>
        )}

        {action.revertedAt && (
          <div
            style={{
              padding: "0.5rem 1rem",
              background: "#f3f4f6",
              borderRadius: "0.375rem",
              color: "#6b7280",
              fontSize: "0.875rem",
            }}
          >
            Reverted {formatDate(action.revertedAt)}
            {action.revertedBy && ` by ${action.revertedBy}`}
          </div>
        )}
      </header>

      {/* Metadata grid */}
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
          padding: "1.25rem",
          background: "#f9fafb",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
        }}
      >
        {[
          ["Action ID", action.id],
          ["Skill", action.skill],
          ["Channel", action.channel],
          ["Entity type", action.entityType],
          ["Entity ID", action.entityId],
          ["Merchant", action.merchantId],
        ].map(([label, value]) => (
          <div key={label}>
            <dt
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.125rem",
              }}
            >
              {label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "#111827",
                wordBreak: "break-all",
              }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Before / After state diff */}
      <h2
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
          color: "#374151",
        }}
      >
        State changes
      </h2>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <StateBlock label="Before" state={action.beforeState} />
        <StateBlock label="After" state={action.afterState} />
      </div>

      {revertable && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem 1.25rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                color: "#991b1b",
                fontSize: "0.875rem",
              }}
            >
              Revert this action
            </p>
            <p
              style={{
                margin: "0.25rem 0 0",
                color: "#b91c1c",
                fontSize: "0.8125rem",
              }}
            >
              This will restore the entity to its state before the action was
              executed. The revert itself will be logged for auditing.
            </p>
          </div>
          <form action={handleRevert}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1.25rem",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Revert this action
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
