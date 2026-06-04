/**
 * Autonomous Action Log — lists every AI-executed commerce action with
 * filtering by channel, skill, and date. Merchants can revert any action
 * with a single click via the inline Server Action form.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getActions, type ActionLogEntry } from "@/lib/commerce/action-logger";
import { revertAction } from "@/lib/commerce/action-reverter";

interface PageProps {
  searchParams: {
    channel?: string;
    skill?: string;
    from_date?: string;
    to_date?: string;
    page?: string;
  };
}

const PAGE_SIZE = 25;

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function actionTypeBadge(actionType: string): string {
  if (actionType.startsWith("revert:")) return "#6b7280";
  if (actionType.includes("price")) return "#2563eb";
  if (actionType.includes("inventory")) return "#16a34a";
  if (actionType.includes("listing")) return "#9333ea";
  return "#64748b";
}

export default async function ActionsPage({
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const currentPage = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  const fromDate = searchParams.from_date
    ? new Date(searchParams.from_date)
    : undefined;
  const toDate = searchParams.to_date
    ? new Date(searchParams.to_date)
    : undefined;

  const actions = await getActions({
    channel: searchParams.channel || undefined,
    skill: searchParams.skill || undefined,
    fromDate,
    toDate,
    limit: PAGE_SIZE,
    offset,
  });

  async function handleRevert(formData: FormData): Promise<void> {
    "use server";
    const actionId = formData.get("actionId");
    if (typeof actionId !== "string" || !actionId) return;
    await revertAction(actionId, "merchant");
    redirect("/actions");
  }

  const activeFilters = [
    searchParams.channel && `channel: ${searchParams.channel}`,
    searchParams.skill && `skill: ${searchParams.skill}`,
    searchParams.from_date && `from: ${searchParams.from_date}`,
    searchParams.to_date && `to: ${searchParams.to_date}`,
  ].filter(Boolean);

  return (
    <section
      style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Autonomous Action Log
        </h1>
        <p style={{ color: "#6b7280", marginTop: "0.25rem", fontSize: "0.875rem" }}>
          Immutable audit trail of every AI-executed commerce action. Revert
          any action with one click.
        </p>
      </header>

      {/* Filter form — GET submission keeps filters in the URL */}
      <form
        method="GET"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#f9fafb",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label
            htmlFor="channel"
            style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}
          >
            Channel
          </label>
          <select
            id="channel"
            name="channel"
            defaultValue={searchParams.channel ?? ""}
            style={{
              padding: "0.375rem 0.625rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              background: "#fff",
            }}
          >
            <option value="">All channels</option>
            <option value="shopify">Shopify</option>
            <option value="amazon">Amazon</option>
            <option value="ebay">eBay</option>
            <option value="walmart">Walmart</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label
            htmlFor="skill"
            style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}
          >
            Skill
          </label>
          <select
            id="skill"
            name="skill"
            defaultValue={searchParams.skill ?? ""}
            style={{
              padding: "0.375rem 0.625rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              background: "#fff",
            }}
          >
            <option value="">All skills</option>
            <option value="repricing">Repricing</option>
            <option value="inventory-sync">Inventory sync</option>
            <option value="listing-optimizer">Listing optimizer</option>
            <option value="manual-revert">Manual revert</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label
            htmlFor="from_date"
            style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}
          >
            From date
          </label>
          <input
            id="from_date"
            name="from_date"
            type="date"
            defaultValue={searchParams.from_date ?? ""}
            style={{
              padding: "0.375rem 0.625rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label
            htmlFor="to_date"
            style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}
          >
            To date
          </label>
          <input
            id="to_date"
            name="to_date"
            type="date"
            defaultValue={searchParams.to_date ?? ""}
            style={{
              padding: "0.375rem 0.625rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "0.5rem",
          }}
        >
          <button
            type="submit"
            style={{
              padding: "0.375rem 0.875rem",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          <Link
            href="/actions"
            style={{
              padding: "0.375rem 0.875rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              color: "#374151",
              textDecoration: "none",
              background: "#fff",
            }}
          >
            Clear
          </Link>
        </div>
      </form>

      {activeFilters.length > 0 && (
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          {activeFilters.map((f) => (
            <span
              key={f as string}
              style={{
                padding: "0.125rem 0.5rem",
                background: "#dbeafe",
                color: "#1e40af",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {actions.length === 0 ? (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: "#9ca3af",
            border: "1px dashed #d1d5db",
            borderRadius: "0.5rem",
          }}
        >
          No actions found
          {activeFilters.length > 0 ? " for the selected filters." : "."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {[
                  "Time",
                  "Action type",
                  "Skill",
                  "Channel",
                  "Entity",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "#374151",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actions.map((action: ActionLogEntry) => (
                <tr
                  key={action.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    opacity: action.revertedAt ? 0.6 : 1,
                  }}
                >
                  <td
                    style={{
                      padding: "0.625rem 0.75rem",
                      whiteSpace: "nowrap",
                      color: "#6b7280",
                    }}
                  >
                    {formatDate(action.executedAt)}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    <span
                      style={{
                        padding: "0.125rem 0.5rem",
                        borderRadius: "0.25rem",
                        background: actionTypeBadge(action.actionType) + "1a",
                        color: actionTypeBadge(action.actionType),
                        fontWeight: 500,
                        fontSize: "0.8125rem",
                      }}
                    >
                      {action.actionType}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.625rem 0.75rem",
                      color: "#374151",
                    }}
                  >
                    {action.skill}
                  </td>
                  <td
                    style={{
                      padding: "0.625rem 0.75rem",
                      color: "#374151",
                    }}
                  >
                    {action.channel}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", color: "#374151" }}>
                    <span style={{ fontWeight: 500 }}>{action.entityType}</span>
                    <span style={{ color: "#9ca3af" }}> #{action.entityId}</span>
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    {action.revertedAt ? (
                      <span style={{ color: "#9ca3af", fontSize: "0.8125rem" }}>
                        Reverted {formatDate(action.revertedAt)}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: "#16a34a",
                          fontWeight: 500,
                          fontSize: "0.8125rem",
                        }}
                      >
                        Active
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "0.625rem 0.75rem",
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Link
                      href={`/actions/${action.id}`}
                      style={{
                        color: "#2563eb",
                        textDecoration: "none",
                        fontSize: "0.8125rem",
                      }}
                    >
                      View
                    </Link>
                    {!action.revertedAt &&
                      !action.actionType.startsWith("revert:") && (
                        <form action={handleRevert}>
                          <input
                            type="hidden"
                            name="actionId"
                            value={action.id}
                          />
                          <button
                            type="submit"
                            style={{
                              padding: "0.125rem 0.5rem",
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              borderRadius: "0.25rem",
                              fontSize: "0.8125rem",
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            Revert
                          </button>
                        </form>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(actions.length === PAGE_SIZE || currentPage > 1) && (
        <div
          style={{
            marginTop: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {currentPage > 1 ? (
            <Link
              href={`/actions?${new URLSearchParams({
                ...searchParams,
                page: String(currentPage - 1),
              }).toString()}`}
              style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.875rem" }}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            Page {currentPage}
          </span>
          {actions.length === PAGE_SIZE ? (
            <Link
              href={`/actions?${new URLSearchParams({
                ...searchParams,
                page: String(currentPage + 1),
              }).toString()}`}
              style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.875rem" }}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </section>
  );
}
