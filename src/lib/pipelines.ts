import type { Side } from "./types";

export interface Stage { key: string; label: string; }
export interface PipelineDef {
  table: string;
  // value fields tried in order for the card amount
  valueFields: string[];
  stages: Stage[];
}

// The two commerce/acquisition spines, straight from migrations 0003/0004.
export const PIPELINES: Record<Side, PipelineDef> = {
  tma: {
    table: "tma_deals",
    valueFields: ["value_cents"],
    stages: [
      { key: "lead", label: "Lead" },
      { key: "qualified", label: "Qualified" },
      { key: "quoted", label: "Quoted" },
      { key: "order", label: "Order" },
      { key: "fulfilling", label: "Fulfilling" },
      { key: "delivered", label: "Delivered" },
      { key: "post_sale", label: "Post-sale" },
    ],
  },
  roark: {
    table: "roark_acquisitions",
    valueFields: ["acquired_cents", "offer_cents", "budget_cents"],
    stages: [
      { key: "inquiry", label: "Inquiry" },
      { key: "consultation", label: "Consultation" },
      { key: "sourcing", label: "Sourcing" },
      { key: "gia_verify", label: "GIA verify" },
      { key: "offer", label: "Offer" },
      { key: "acquired", label: "Acquired" },
      { key: "aftercare", label: "Aftercare" },
    ],
  },
};

export interface TableDef {
  key: string;
  label: string;
  table: string;
  columns: { field: string; label: string; kind?: "money" | "date" | "bool" | "pill" }[];
}

// Secondary entities, rendered as real navigable lists (read). Detail/edit
// drawers for these are the next increment.
export const TABLES: Record<Side, TableDef[]> = {
  tma: [
    {
      key: "suppliers", label: "Suppliers", table: "suppliers",
      columns: [
        { field: "name", label: "Supplier" },
        { field: "status", label: "Status", kind: "pill" },
        { field: "map_scope", label: "MAP Scope", kind: "pill" },
        { field: "map_schedule_received", label: "MAP Schedule", kind: "bool" },
      ],
    },
    // Margin Sentinel (0019). Dollar columns are plain numbers — money() expects
    // cents, and these are dollar numerics. Margin Watch is a read-only view
    // (no FORMS spec) so rows aren't clickable.
    {
      key: "margin_watch", label: "Margin Watch", table: "v_margin_watch",
      columns: [
        { field: "sku", label: "SKU" },
        { field: "product_name", label: "Product" },
        { field: "sell_price", label: "Sell $" },
        { field: "loaded_cost", label: "Loaded $" },
        { field: "margin_pct", label: "Margin %" },
        { field: "margin_floor_pct", label: "Floor %" },
        { field: "floor_shortfall_usd", label: "Short $" },
        { field: "below_floor", label: "Below floor", kind: "bool" },
        { field: "watch_standalone", label: "Watched", kind: "bool" },
      ],
    },
    {
      key: "sku_economics", label: "SKU Economics", table: "sku_economics",
      columns: [
        { field: "sku", label: "SKU" },
        { field: "product_name", label: "Product" },
        { field: "dealer_cost", label: "Dealer $" },
        { field: "freight_estimate", label: "Freight $" },
        { field: "sell_price", label: "Sell $" },
        { field: "margin_floor_pct", label: "Floor %" },
        { field: "watch_standalone", label: "Watched", kind: "bool" },
      ],
    },
    {
      key: "pricing_alerts", label: "Pricing Alerts", table: "pricing_change_alerts",
      columns: [
        { field: "detected_at", label: "Detected", kind: "date" },
        { field: "source", label: "Source", kind: "pill" },
        { field: "detail", label: "Detail" },
        { field: "reviewed", label: "Reviewed", kind: "bool" },
        { field: "resolution", label: "Resolution", kind: "pill" },
      ],
    },
    {
      key: "margin_breaches", label: "Margin Breaches", table: "margin_breach_alerts",
      columns: [
        { field: "sku", label: "SKU" },
        { field: "product_name", label: "Product" },
        { field: "margin_pct", label: "Margin %" },
        { field: "margin_floor_pct", label: "Floor %" },
        { field: "detected_at", label: "Detected", kind: "date" },
        { field: "notified", label: "Notified", kind: "bool" },
        { field: "resolved", label: "Resolved", kind: "bool" },
      ],
    },
    // ---- Competitor Bench (0023) — read-only, public-marketing intel. ----
    {
      key: "cb_longevity", label: "Competitor Ads", table: "v_cb_ad_longevity",
      columns: [
        { field: "competitor", label: "Competitor" },
        { field: "headline", label: "Headline" },
        { field: "angle_category", label: "Angle", kind: "pill" },
        { field: "format", label: "Format", kind: "pill" },
        { field: "longevity_days", label: "Days running" },
        { field: "still_active", label: "Active", kind: "bool" },
      ],
    },
    {
      key: "cb_reports", label: "Pattern Reports", table: "cb_pattern_reports",
      columns: [
        { field: "period", label: "Period" },
        { field: "report_type", label: "Type", kind: "pill" },
        { field: "title", label: "Title" },
        { field: "status", label: "Status", kind: "pill" },
      ],
    },
  ],
  roark: [
    {
      key: "inventory", label: "Inventory", table: "roark_inventory",
      columns: [
        { field: "sku", label: "Stock #" },
        { field: "shape", label: "Shape" },
        { field: "carat", label: "Carat" },
        { field: "color", label: "Color" },
        { field: "clarity", label: "Clarity" },
        { field: "status", label: "Status", kind: "pill" },
        { field: "is_africa_direct", label: "Africa Direct", kind: "bool" },
        { field: "ask_cents", label: "Ask", kind: "money" },
      ],
    },
    {
      key: "provenance", label: "Provenance", table: "roark_provenance",
      columns: [
        { field: "event", label: "Event", kind: "pill" },
        { field: "origin_country", label: "Origin" },
        { field: "kp_certificate", label: "KP Cert" },
        { field: "occurred_on", label: "Date", kind: "date" },
        { field: "actor", label: "Actor" },
      ],
    },
    // ---- Competitor Bench (0023) — read-only, public-marketing intel. ----
    {
      key: "cb_longevity", label: "Competitor Ads", table: "v_cb_ad_longevity",
      columns: [
        { field: "competitor", label: "Competitor" },
        { field: "headline", label: "Headline" },
        { field: "angle_category", label: "Angle", kind: "pill" },
        { field: "format", label: "Format", kind: "pill" },
        { field: "longevity_days", label: "Days running" },
        { field: "still_active", label: "Active", kind: "bool" },
      ],
    },
    {
      key: "cb_reports", label: "Pattern Reports", table: "cb_pattern_reports",
      columns: [
        { field: "period", label: "Period" },
        { field: "report_type", label: "Type", kind: "pill" },
        { field: "title", label: "Title" },
        { field: "status", label: "Status", kind: "pill" },
      ],
    },
  ],
};
