import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import type { Contact } from "../lib/types";

// ---------------------------------------------------------------------------
// Internal Quote Builder — the staff-facing surface that composes a quote and
// invokes the deployed `quotes-create` Edge Function (verify_jwt = true, so the
// signed-in user's JWT is attached automatically by supabase.functions.invoke,
// and RLS enforces the caller is a writer in this workspace).
//
// Contract mirrors supabase/functions/quotes-create/index.ts exactly:
//   body = { workspace_id, contact_id, salutation_name, does_it_fit_reqs?, lines[] }
//   line = { shopify_product_gid, shopify_variant_gid?, title, sku?, qty,
//            unit_price, white_glove_selected, white_glove_fee? }
//
// MONEY UNITS: whole dollars (decimal). Confirmed against the deployed public
// QuotePage, which formats unit_price/line_total/subtotal/total with a plain
// currency formatter and NO /100 — unlike the CRM's _cents columns.
//
// HARD CONSTRAINTS enforced client-side to avoid the function's 422s:
//   - Products are limited to those mapped in product_terms_map for this
//     workspace; an unmapped GID hard-fails server-side.
//   - White-glove can only be selected for products whose current terms have
//     white_glove_available = true; otherwise the function 422s.
// ---------------------------------------------------------------------------

interface Line {
  key: string; // client-only React key
  shopify_product_gid: string;
  title: string;
  sku: string;
  qty: number;
  unit_price: number; // dollars
  white_glove_selected: boolean;
  white_glove_fee: number; // dollars
}

interface MappedProduct {
  gid: string;
  terms_class: string;
  supplier: string | null;
  white_glove_available: boolean;
  has_current_terms: boolean;
}

interface CreatedQuote {
  quote_id: string;
  quote_number: string;
  valid_until: string;
  quote_url: string;
  pdf: string;
}

const usd = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";

const shortGid = (gid: string) => gid.split("/").pop() ?? gid;

let lineSeq = 0;
const newLine = (): Line => ({
  key: `l${++lineSeq}`,
  shopify_product_gid: "",
  title: "",
  sku: "",
  qty: 1,
  unit_price: 0,
  white_glove_selected: false,
  white_glove_fee: 0,
});

export function QuoteBuilder() {
  const { current } = useSession();
  const isTma = current?.slug === "tma";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<MappedProduct[]>([]);
  const [contactId, setContactId] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedQuote | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!current || !isTma) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: cts }, { data: maps }, { data: terms }] = await Promise.all([
        supabase
          .from("contacts")
          .select("*")
          .eq("workspace_id", current.id)
          .order("name"),
        supabase
          .from("product_terms_map")
          .select("shopify_product_gid, terms_class")
          .eq("workspace_id", current.id),
        supabase
          .from("product_terms")
          .select("terms_class, supplier, white_glove_available")
          .eq("workspace_id", current.id)
          .is("effective_to", null),
      ]);
      if (!alive) return;

      setContacts((cts as Contact[]) ?? []);

      const termsByClass = new Map(
        (((terms as Array<Record<string, unknown>>) ?? []).map((t) => [
          t.terms_class as string,
          t,
        ])),
      );
      const list: MappedProduct[] = (
        ((maps as Array<Record<string, unknown>>) ?? [])
      ).map((m) => {
        const cls = m.terms_class as string;
        const t = termsByClass.get(cls);
        return {
          gid: m.shopify_product_gid as string,
          terms_class: cls,
          supplier: (t?.supplier as string) ?? null,
          white_glove_available: Boolean(t?.white_glove_available),
          has_current_terms: Boolean(t),
        };
      });
      setProducts(list);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [current, isTma]);

  const productByGid = useMemo(
    () => new Map(products.map((p) => [p.gid, p])),
    [products],
  );

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const whiteGlove = lines.reduce(
    (s, l) => s + (l.white_glove_selected ? l.white_glove_fee : 0),
    0,
  );
  const total = subtotal + whiteGlove;

  function patch(key: string, next: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));
  }

  function onProduct(key: string, gid: string) {
    const p = productByGid.get(gid);
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              shopify_product_gid: gid,
              // force white-glove off if this product's terms disallow it
              white_glove_selected: p?.white_glove_available
                ? l.white_glove_selected
                : false,
              white_glove_fee: p?.white_glove_available ? l.white_glove_fee : 0,
            }
          : l,
      ),
    );
  }

  const lineValid = (l: Line) =>
    l.shopify_product_gid !== "" &&
    l.title.trim() !== "" &&
    l.qty >= 1 &&
    l.unit_price >= 0;

  const canSubmit =
    isTma &&
    contactId !== "" &&
    lines.length > 0 &&
    lines.every(lineValid) &&
    !submitting;

  async function submit() {
    if (!current) return;
    setError(null);
    setSubmitting(true);
    const contact = contacts.find((c) => c.id === contactId);
    const payload = {
      workspace_id: current.id,
      contact_id: contactId,
      salutation_name: contact?.name ?? "",
      lines: lines.map((l) => ({
        shopify_product_gid: l.shopify_product_gid,
        title: l.title.trim(),
        sku: l.sku.trim() || undefined,
        qty: l.qty,
        unit_price: l.unit_price,
        white_glove_selected: l.white_glove_selected,
        white_glove_fee: l.white_glove_selected ? l.white_glove_fee : undefined,
      })),
    };

    const { data, error: fnErr } = await supabase.functions.invoke(
      "quotes-create",
      { body: payload },
    );

    if (fnErr) {
      // Surface the real server message (422 terms-mapping / white-glove, etc.)
      let msg = fnErr.message;
      const ctx = (fnErr as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const b = (await ctx.json()) as { error?: string };
          if (b?.error) msg = b.error;
        } catch {
          /* body was not JSON; keep the generic message */
        }
      }
      setError(msg);
      setSubmitting(false);
      return;
    }

    setCreated(data as CreatedQuote);
    setSubmitting(false);
  }

  function reset() {
    setCreated(null);
    setError(null);
    setContactId("");
    setLines([newLine()]);
    setCopied(false);
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.quote_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the link is visible to copy manually */
    }
  }

  // ---- render -------------------------------------------------------------

  if (!isTma) {
    return (
      <div className="center-note">
        Quotes are a TMA workflow. Switch to the TMA workspace to build one.
      </div>
    );
  }

  if (loading) return <div className="center-note">Loading quote builder…</div>;

  if (created) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div
          style={{
            border: "1px solid var(--line, #e5e2da)",
            borderRadius: 10,
            padding: 24,
            background: "var(--card, #fff)",
          }}
        >
          <div className="k" style={{ marginBottom: 4 }}>
            Quote created
          </div>
          <div className="v" style={{ fontSize: 22, marginBottom: 16 }}>
            {created.quote_number}
          </div>

          <div className="field">
            <span className="fk">Valid until</span>
            <span>
              {new Date(created.valid_until).toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="field">
            <span className="fk">PDF</span>
            <span>{created.pdf === "pending" ? "Pending — attached by Concierge Mail on send" : created.pdf}</span>
          </div>

          <div style={{ margin: "18px 0 6px" }} className="fk">
            Customer link
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="input"
              readOnly
              value={created.quote_url}
              style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
            <a href={created.quote_url} target="_blank" rel="noreferrer">
              <button>Open</button>
            </a>
          </div>
          {created.quote_url.startsWith("undefined") && (
            <div className="sub" style={{ color: "#b23", marginTop: 8 }}>
              Link begins with “undefined” — PUBLIC_BASE_URL is not set on the
              quotes-create function. Set it in Supabase secrets, then re-create.
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            <button onClick={reset}>Build another</button>
          </div>
        </div>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="center-note">
        No products are mapped to terms yet. Add rows to{" "}
        <code>product_terms_map</code> (and their <code>product_terms</code>)
        for this workspace before quoting — the quote function hard-fails on any
        unmapped product.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {error && (
        <div
          role="alert"
          style={{
            border: "1px solid #e3b9b9",
            background: "#fbf2f2",
            color: "#912",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div className="row-actions" style={{ marginBottom: 18 }}>
        <label className="fk" style={{ minWidth: 120 }}>
          Customer
        </label>
        <select
          className="input"
          style={{ maxWidth: 420 }}
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
        >
          <option value="">Select a contact…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` — ${c.company}` : ""}
            </option>
          ))}
        </select>
        {!contacts.length && (
          <span className="sub">No contacts in this workspace yet.</span>
        )}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Product (mapped)</th>
              <th style={{ minWidth: 200 }}>Title on quote</th>
              <th style={{ width: 70 }}>Qty</th>
              <th style={{ width: 130 }}>Unit ($)</th>
              <th style={{ width: 150 }}>White-glove</th>
              <th style={{ width: 120 }}>Line total</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = productByGid.get(l.shopify_product_gid);
              return (
                <tr key={l.key}>
                  <td>
                    <select
                      className="input"
                      value={l.shopify_product_gid}
                      onChange={(e) => onProduct(l.key, e.target.value)}
                    >
                      <option value="">Select product…</option>
                      {products.map((pr) => (
                        <option key={pr.gid} value={pr.gid}>
                          {pr.terms_class}
                          {pr.supplier ? ` · ${pr.supplier}` : ""} —{" "}
                          {shortGid(pr.gid)}
                          {pr.has_current_terms ? "" : " (no current terms)"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      placeholder="Customer-facing title"
                      value={l.title}
                      onChange={(e) => patch(l.key, { title: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="SKU (optional)"
                      value={l.sku}
                      onChange={(e) => patch(l.key, { sku: e.target.value })}
                      style={{ marginTop: 6, fontSize: 12 }}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) =>
                        patch(l.key, { qty: Math.max(1, Number(e.target.value)) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unit_price}
                      onChange={(e) =>
                        patch(l.key, { unit_price: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    {p?.white_glove_available ? (
                      <div>
                        <label
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            fontSize: 13,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={l.white_glove_selected}
                            onChange={(e) =>
                              patch(l.key, {
                                white_glove_selected: e.target.checked,
                              })
                            }
                          />
                          Add
                        </label>
                        {l.white_glove_selected && (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Fee ($)"
                            value={l.white_glove_fee}
                            onChange={(e) =>
                              patch(l.key, {
                                white_glove_fee: Number(e.target.value),
                              })
                            }
                            style={{ marginTop: 6 }}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="sub">
                        {l.shopify_product_gid ? "Not available" : "—"}
                      </span>
                    )}
                  </td>
                  <td>{usd(l.qty * l.unit_price)}</td>
                  <td>
                    <button
                      aria-label="Remove line"
                      onClick={() =>
                        setLines((ls) =>
                          ls.length > 1
                            ? ls.filter((x) => x.key !== l.key)
                            : ls,
                        )
                      }
                      disabled={lines.length === 1}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row-actions" style={{ marginTop: 12 }}>
        <button onClick={() => setLines((ls) => [...ls, newLine()])}>
          + Add line
        </button>
      </div>

      <div
        className="q-totals"
        style={{
          marginTop: 22,
          marginLeft: "auto",
          maxWidth: 320,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>{usd(subtotal)}</span>
        </div>
        {whiteGlove > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>White-glove delivery</span>
            <span>{usd(whiteGlove)}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 600,
            borderTop: "1px solid var(--line, #e5e2da)",
            paddingTop: 6,
          }}
        >
          <span>Total</span>
          <span>{usd(total)}</span>
        </div>
        <div className="sub">
          Server recomputes totals from terms — this is a preview.
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={submit} disabled={!canSubmit}>
          {submitting ? "Creating…" : "Create quote"}
        </button>
      </div>
    </div>
  );
}
