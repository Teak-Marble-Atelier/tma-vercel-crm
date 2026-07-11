# Roark | TMA CRM

One CRM chassis, two isolated sides. Supabase (Postgres + RLS + Edge Functions) · Vercel front-end. Same proven pattern as the Sugarman | Youman system.

## The two-sides model
`roark` and `tma` are **workspaces** in a single database. Every business row carries a `workspace_id`, and Row-Level Security enforces isolation **at the database layer** — a TMA user's query cannot return Roark rows, and vice versa. Gregg is a `platform_admin` (sees both, with a workspace switcher). Scoped users (a TMA rep, or Bill Nibs on Roark) see only their side.

This is separation by *enforcement*, not by running two systems. The only reason to split into two Supabase projects would be a hard legal/entity requirement to physically segregate the data — in which case it's the same code deployed twice, not a second build.

## Roles
`owner · admin · member · partner · readonly` — per workspace. `member`+ can write; `partner`/`readonly` are scoped read (e.g. a referral partner sees only their attributed pipeline).

## Pipelines
- **TMA — commerce spine:** lead → qualified → quoted → order → fulfilling → delivered → post-sale. Fed by Does-It-Fit, Vapi (Aria/Marcus), Shopify.
- **TMA — suppliers (second pipeline):** prospect → outreach → applied → approved → active. Fed from the Sourcing Bench (discovery/grading stays there; the CRM is the relationship system of record).
- **Roark — acquisition:** inquiry → consultation → sourcing → GIA verify → offer → acquired → aftercare. RapNet-fed inventory, provenance / Africa-Direct records, referral partners.

## Build status
| # | Migration | Status |
|---|-----------|--------|
| 0001 | foundation — workspaces, users, memberships, RLS helpers, audit | ✅ parse-verified |
| 0002 | core — contacts, activities, tasks (shared) | ✅ parse-verified |
| 0003 | TMA — deals (commerce spine), orders + items, supplier pipeline | ✅ parse-verified |
| 0004 | Roark — inventory (stones), acquisitions, provenance/KP | ✅ parse-verified |
| — | Edge Functions — RapNet, Vapi, Shopify, enrich (4 fns) | ✅ syntax-verified |
| — | Web app — Vite/React, switcher, board (drag+writeback), themes | ✅ builds clean |
| — | Runbook + Quickstart + seed | ✅ done |

## Programming vs. configuration (the split that lets this ship tonight)
**All code is written against stable, public API contracts and needs no live credentials.** What Dan does later is pure configuration:
- create the Supabase project + run migrations (`supabase db push`)
- create the Google Cloud project + OAuth/dev-token (for enrichment/attribution)
- set secrets in Supabase + Vercel; wire Vapi/Shopify/Postmark webhooks; deploy

The repo sits finished and dormant until the keys are dropped in. Nothing about the model that authored it affects portability — it's a repo Dan deploys.

## Security notes
- Access helpers (`is_member`, `has_role`, `can_write`) are `SECURITY DEFINER` to avoid RLS recursion on `memberships`.
- `audit_log` is append-only; every write to a business table is captured with actor + diff.
- No PII is ever pushed to analytics/ads endpoints (aggregate-in, identified-out).
