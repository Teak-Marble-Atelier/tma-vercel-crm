export type Side = "tma" | "roark";

export interface Workspace {
  id: string;
  slug: Side;
  name: string;
  brand: Record<string, unknown>;
}
export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  is_platform_admin: boolean;
}
export interface Contact {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: string | null;
  tags: string[];
  created_at: string;
}
export interface Activity {
  id: string;
  contact_id: string | null;
  type: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
}
// A pipeline card is a tma_deal or a roark_acquisition — shared shape here.
export interface PipelineRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  title: string;
  stage: string;
  source: string | null;
  value_cents?: number | null;
  budget_cents?: number | null;
  offer_cents?: number | null;
  acquired_cents?: number | null;
  updated_at: string;
}
export interface QuoteLineItem {
  id: string;
  quote_id: string;
  shopify_product_gid: string;
  title: string;
  sku: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  white_glove_selected: boolean;
  all_sales_final: boolean;
}
export interface Quote {
  id: string;
  workspace_id: string;
  contact_id: string;
  created_by: string;
  quote_number: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "expired" | "withdrawn";
  valid_until: string;
  subtotal: number;
  white_glove_fee: number;
  total: number;
  pdf_storage_path: string | null;
  created_at: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  accepted_at: string | null;
  contacts?: { name: string; email: string | null } | null;
  quote_line_items?: QuoteLineItem[];
}
export type OrderStage = "received" | "processing" | "shipped" | "in_transit" | "delivery_scheduled" | "delivered" | "exception";
export interface OrderStageEvent {
  id: string;
  order_id: string;
  stage: OrderStage;
  occurred_at: string;
  source: string;
}
export interface Order {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  quote_id: string | null;
  order_number: string;
  stage: OrderStage;
  terms_class: string;
  ltl_carrier: string | null;
  pro_number: string | null;
  tracking_url: string | null;
  white_glove: boolean;
  delivery_appointment: string | null;
  exception_note: string | null;
  updated_at: string;
  contacts?: { name: string; email: string | null } | null;
  order_stage_events?: OrderStageEvent[];
}
