// Field specs that drive the generic create/edit/delete drawer
// (RecordFormDrawer). Each spec curates exactly which columns are editable
// and how — never the raw table, so id/workspace_id/created_at/audit/generated
// columns are never touched. Enum option lists mirror the migration enums
// (0002-0005) exactly. workspace_id is set by the drawer on insert.

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "select"
  | "bool" | "date" | "email" | "tags";

export interface FormField {
  field: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];                              // for select
  fk?: { table: string; labelField: string };      // for id references
  step?: string;                                   // for number
  help?: string;
}

export interface FormSpec {
  table: string;
  label: string;         // singular noun, e.g. "Supplier"
  fields: FormField[];
  appendOnly?: boolean;  // ledger tables: create only, no edit/delete
}

// ---- enum option lists (verbatim from the migrations) --------------------
const SUPPLIER_STAGE = ["prospect", "outreach", "applied", "approved", "active", "declined", "dormant"];
const SUPPLIER_TIER = ["gold", "silver", "bronze"];
const SUPPLIER_STATUS = ["active", "pending_contract", "inactive"];
const MAP_SCOPE = ["advertised_only", "includes_quotes", "no_map_policy"];
const STONE_STATUS = ["sourcing", "available", "reserved", "on_memo", "sold", "returned"];
const PROVENANCE_EVENT = ["rough_sourced", "kp_certified", "imported", "cut", "graded", "sold"];

// ---- contacts (shared core; ContactsView keeps its own Timeline) ---------
export const CONTACT_FORM: FormSpec = {
  table: "contacts",
  label: "Contact",
  fields: [
    { field: "name", label: "Name", type: "text", required: true },
    { field: "kind", label: "Kind", type: "select", required: true, options: ["person", "company"] },
    { field: "company", label: "Company", type: "text" },
    { field: "email", label: "Email", type: "email" },
    { field: "phone", label: "Phone", type: "text" },
    { field: "title", label: "Title", type: "text" },
    { field: "source", label: "Source", type: "text", help: "e.g. manual, referral, shopify, vapi" },
    { field: "tags", label: "Tags", type: "tags", help: "comma-separated" },
  ],
};

// ---- record tables (looked up by table name from RecordsView) ------------
export const FORMS: Record<string, FormSpec> = {
  tma_suppliers: {
    table: "tma_suppliers",
    label: "Supplier",
    fields: [
      { field: "name", label: "Supplier", type: "text", required: true },
      { field: "stage", label: "Stage", type: "select", required: true, options: SUPPLIER_STAGE },
      { field: "tier", label: "Tier", type: "select", options: SUPPLIER_TIER },
      { field: "category", label: "Category", type: "text", help: "e.g. cold plunge, sauna, outdoor shower" },
      { field: "website", label: "Website", type: "text" },
      { field: "contact_name", label: "Contact name", type: "text" },
      { field: "contact_email", label: "Contact email", type: "email" },
      { field: "contact_phone", label: "Contact phone", type: "text" },
      { field: "dealer_margin_pct", label: "Dealer margin %", type: "number", step: "0.01" },
      { field: "lead_time_days", label: "Lead time (days)", type: "number" },
      { field: "white_glove", label: "White-glove", type: "bool" },
      { field: "freight_terms", label: "Freight terms", type: "text" },
      { field: "agreement_status", label: "Agreement", type: "text", help: "none, sent, redlined, executed" },
    ],
  },
  // The REAL, live-data suppliers table (0008_supplier_pricing.sql) — MAP
  // pricing compliance tracking, distinct from tma_suppliers above (an
  // earlier prospect/onboarding pipeline concept that's empty in production
  // and unreferenced by anything else in the schema). This is the one the
  // "Suppliers" nav link now points to.
  suppliers: {
    table: "suppliers",
    label: "Supplier",
    fields: [
      { field: "name", label: "Supplier", type: "text", required: true },
      { field: "status", label: "Status", type: "select", required: true, options: SUPPLIER_STATUS },
      {
        field: "map_scope", label: "MAP scope", type: "select", required: true, options: MAP_SCOPE,
        help: "Whether MAP applies to advertised prices only, or to quotes too. Conservative default is includes_quotes until the contract clause is verified.",
      },
      { field: "map_scope_source", label: "MAP scope source", type: "text", help: "Citation: agreement section, welcome-doc page, or email date" },
      { field: "map_schedule_received", label: "MAP schedule received", type: "bool" },
      { field: "map_schedule_source", label: "MAP schedule source", type: "text", help: "Filename/email reference once received" },
    ],
  },
  roark_inventory: {
    table: "roark_inventory",
    label: "Stone",
    fields: [
      { field: "sku", label: "Stock #", type: "text" },
      { field: "shape", label: "Shape", type: "text" },
      { field: "carat", label: "Carat", type: "number", step: "0.01" },
      { field: "color", label: "Color", type: "text" },
      { field: "clarity", label: "Clarity", type: "text" },
      { field: "cut", label: "Cut", type: "text" },
      { field: "polish", label: "Polish", type: "text" },
      { field: "symmetry", label: "Symmetry", type: "text" },
      { field: "fluorescence", label: "Fluorescence", type: "text" },
      { field: "measurements", label: "Measurements", type: "text" },
      { field: "lab", label: "Lab", type: "text", help: "GIA, IGI" },
      { field: "cert_number", label: "Cert #", type: "text" },
      { field: "cert_url", label: "Cert URL", type: "text" },
      { field: "cost_cents", label: "Cost", type: "money" },
      { field: "ask_cents", label: "Ask", type: "money" },
      { field: "status", label: "Status", type: "select", required: true, options: STONE_STATUS },
      { field: "is_africa_direct", label: "Africa Direct", type: "bool" },
    ],
  },
  roark_provenance: {
    table: "roark_provenance",
    label: "Provenance event",
    appendOnly: true, // chain-of-custody ledger: append only
    fields: [
      { field: "inventory_id", label: "Stone", type: "select", required: true, fk: { table: "roark_inventory", labelField: "sku" } },
      { field: "event", label: "Event", type: "select", required: true, options: PROVENANCE_EVENT },
      { field: "occurred_on", label: "Date", type: "date" },
      { field: "origin_country", label: "Origin country", type: "text" },
      { field: "kp_certificate", label: "KP certificate #", type: "text" },
      { field: "actor", label: "Actor", type: "text", help: "who / where in the chain" },
      { field: "note", label: "Note", type: "textarea" },
    ],
  },
};
