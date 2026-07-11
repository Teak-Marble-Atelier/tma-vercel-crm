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
