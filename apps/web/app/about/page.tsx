/**
 * About page.
 *
 * Repo-backed marketing copy (product-flywheel-001). The previous version
 * rendered the COMPANY_DESCRIPTION env var and fell back to "coming soon" —
 * QA-flagged as a placeholder. Copy is grounded in what the product actually
 * does (channel connections, repricing with guardrails, skill schedules, the
 * reviewable action log); no invented team, history, or testimonials.
 */
import type { JSX } from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Merchly — autonomous commerce operations",
  description:
    "Merchly runs the repetitive work of multi-channel selling — channel sync health, repricing within your guardrails, listing upkeep — on schedules you control, with every action logged and revertible.",
};

export default function AboutPage(): JSX.Element {
  return (
    <main>
      <span style={{ display: "inline-block", fontSize: "0.8rem", fontWeight: 650, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--substrate-accent)", marginBottom: "0.6rem" }}>About Merchly</span>
      <h1 style={{ marginBottom: "0.5rem" }}>
        The operations engine for multi-channel sellers
      </h1>
      <p style={{ maxWidth: "44rem", fontSize: "1.05rem", lineHeight: 1.7 }}>
        Merchly does the repetitive operational work of selling on more than one platform —
        watching channel sync health, keeping prices inside your rules, and keeping listings
        fresh — so a small team can run Shopify and Amazon without living in two admin consoles.
      </p>

      <section style={{ marginTop: "2rem", maxWidth: "44rem" }}>
        <h2>How it works</h2>
        <ul style={{ lineHeight: 1.8 }}>
          <li>
            <strong>Connect your channels.</strong> Link the platforms you sell on from{" "}
            <Link href="/channels">Channels</Link>; Merchly monitors connection status, sync
            health, and rate limits in one place.
          </li>
          <li>
            <strong>Set the guardrails.</strong> Skills like the repricing engine work inside
            rules you define — floor and ceiling prices, target margins, strategy — and pricing
            skills require explicit confirmation before their first autonomous run.
          </li>
          <li>
            <strong>Put it on a schedule.</strong> From <Link href="/schedule">Schedule</Link>,
            each skill runs hourly, nightly, weekly, or on your own cron expression — repricing,
            inventory reconciliation, listing audits, a daily digest.
          </li>
          <li>
            <strong>Review everything.</strong> Every autonomous action lands in the{" "}
            <Link href="/actions">action log</Link> with before/after state — and actions can be
            reverted. The automation works for you; you stay the authority.
          </li>
        </ul>
      </section>

      <section style={{ marginTop: "2rem", maxWidth: "44rem" }}>
        <h2>Get in touch</h2>
        <p style={{ lineHeight: 1.7 }}>
          Questions? Read the <Link href="/help">Help Center</Link>, reach us through{" "}
          <Link href="/support">support</Link>, or email{" "}
          <a href="mailto:hello@trymerchly.com">hello@trymerchly.com</a>.
        </p>
      </section>

      <section style={{ marginTop: "2.5rem", padding: "2rem", maxWidth: "44rem", border: "1px solid color-mix(in srgb, var(--substrate-accent) 22%, var(--substrate-border))", borderRadius: "12px", background: "color-mix(in srgb, var(--substrate-accent) 7%, var(--substrate-bg))" }}>
        <h2 style={{ marginTop: 0 }}>See your channels in one place</h2>
        <p>
          Create an account and connect a channel — the dashboard shows sync health and the
          work Merchly is ready to take off your plate.
        </p>
        <Link href="/signup" className="btn">
          Create an account
        </Link>
      </section>
    </main>
  );
}
