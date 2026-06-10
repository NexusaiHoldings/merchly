/**
 * home-config (company-root-landing-001 backport). Do NOT hand-edit.
 */
export interface HomeCta { label: string; href: string; }
export interface HomeConfig {
  mode: "landing" | "conversation";
  headline?: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
}

export const homeConfig: HomeConfig = {
  "mode": "landing",
  "headline": "Stop managing your stores. Let Merchly run them \u2014 across Shopify, Amazon, eBay, and Etsy, around the clock, without hiri",
  "subhead": "Merchly is the AI-native commerce automation platform built exclusively for DTC owner-operators selling on 3+ channels simultaneously \u2014 pre-loaded AI skill bundles for listing optimisation, dynamic repricing, and inventory sync activate on "
};
