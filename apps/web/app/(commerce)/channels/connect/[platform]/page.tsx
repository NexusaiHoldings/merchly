/**
 * /channels/connect/[platform] — OAuth connection flow for a commerce channel.
 *
 * Handles both directions of the OAuth handshake:
 *   1. Initial load (no query params) → renders "Connect" button that redirects
 *      the merchant to the platform's OAuth consent page.
 *   2. OAuth callback (code + state query params) → exchanges the code for an
 *      access token, saves encrypted credentials, then redirects to /channels.
 *
 * Server component so the token exchange and DB write happen server-side only;
 * the access token never touches the browser.
 */

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/admin-auth";
import "@/lib/commerce/connectors/shopify";
import "@/lib/commerce/connectors/amazon";
import { getConnector } from "@/lib/commerce/connectors/base";

export const dynamic = "force-dynamic";

interface PageProps {
  readonly params: { platform: string };
  readonly searchParams: Record<string, string | string[] | undefined>;
}

function getString(val: string | string[] | undefined): string | null {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

/** Render a connect prompt for the given platform. */
function ConnectPrompt({
  platform,
  displayName,
  oauthHref,
}: {
  readonly platform: string;
  readonly displayName: string;
  readonly oauthHref: string;
}): JSX.Element {
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        Connect {displayName}
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 32, lineHeight: 1.6 }}>
        Authorize access to your {displayName} store so the platform can sync
        products, orders, and inventory automatically.
      </p>
      <a
        href={oauthHref}
        style={{
          display: "inline-block",
          padding: "12px 28px",
          background: "#2563eb",
          color: "#ffffff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        Authorize {displayName}
      </a>
      <div style={{ marginTop: 20 }}>
        <a href="/channels" style={{ color: "#6b7280", fontSize: 14, textDecoration: "none" }}>
          ← Back to channels
        </a>
      </div>
    </main>
  );
}

/** Render an error state. */
function ConnectError({ message }: { readonly message: string }): JSX.Element {
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "#dc2626", marginBottom: 12 }}>
        Connection failed
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 32 }}>{message}</p>
      <a
        href="/channels"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          textDecoration: "none",
          color: "#374151",
          fontWeight: 600,
        }}
      >
        Back to channels
      </a>
    </main>
  );
}

export default async function ConnectPlatformPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const { platform } = params;

  const connector = getConnector(platform);
  if (!connector) {
    notFound();
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const code = getString(searchParams.code);
  const shop = getString(searchParams.shop);
  const errorParam = getString(searchParams.error);

  // OAuth error returned by the platform
  if (errorParam) {
    const desc = getString(searchParams.error_description) ?? errorParam;
    return <ConnectError message={desc} />;
  }

  // OAuth callback — exchange code for token and save
  if (code) {
    try {
      const accessToken = await connector.exchangeToken(code, shop ?? undefined);
      await connector.saveConnection(user.id, accessToken, shop ?? undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error during connection";
      return <ConnectError message={message} />;
    }
    redirect("/channels");
  }

  // Initial page — generate OAuth URL with a CSRF state token
  const state = `${user.id}-${Date.now()}`;
  const oauthHref = connector.oauthUrl(state, shop ?? undefined);

  return (
    <ConnectPrompt
      platform={platform}
      displayName={connector.displayName}
      oauthHref={oauthHref}
    />
  );
}
