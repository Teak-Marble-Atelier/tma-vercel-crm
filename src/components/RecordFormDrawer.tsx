import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../state/Session";
import type { FormField, FormSpec } from "../lib/forms";

type Row = Record<string, unknown>;
type FkOption = { id: string; label: string };

// Generic create / edit / delete surface for one row of one table, driven by
// a curated FormSpec. Writes run in the user's session, so RLS (can_write)
// governs every insert/update/delete — the UI never escalates privilege.
export function RecordFormDrawer({
  spec, row, onClose, onSaved, extra,
}: {
  spec: FormSpec;
  row: Row | null;                 // null = create, object = edit
  onClose: () => void;
  onSaved: () => void;
  extra?: ReactNode;               // e.g. a Timeline, shown under the form in edit mode
}) {
  const { current } = useSession();
  const isEdit = row != null;

  // seed initial string-form values from the row (or blanks / sensible defaults)
  const [vals, setVals] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.field, initValue(f, row)])),
  );
  const [fkOptions, setFkOptions] = useState<Record<string, FkOption[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // load options for any FK fields (workspace-scoped)
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!current) return;
      const fks = spec.fields.filter((f) => f.fk);
      const out: Record<string, FkOption[]> = {};
      for (const f of fks) {
        const { data } = await supabase
          .from(f.fk!.table)
          .select(`id, ${f.fk!.labelField}`)
          .eq("workspace_id", current.id)
          .limit(500);
        out[f.field] = ((data as unknown as Row[]) ?? []).map((r) => ({
          id: r.id as string,
          label: (r[f.fk!.labelField] as string) || (r.id as string).slice(0, 8),
        }));
      }
      if (alive) setFkOptions(out);
    }
    load();
    return () => { alive = false; };
  }, [current, spec]);

  const set = (field: string, v: string | boolean) =>
    setVals((s) => ({ ...s, [field]: v }));

  const missingRequired = useMemo(
    () => spec.fields.some((f) => f.required && String(vals[f.field] ?? "").trim() === ""),
    [spec.fields, vals],
  );

  async function save() {
    if (!current) return;
    setError(null);
    setBusy(true);

    const payload: Row = {};
    for (const f of spec.fields) {
      const coerced = coerce(f, vals[f.field]);
      // On INSERT, skip blank non-required scalars so DB defaults apply.
      // On UPDATE, include everything so a cleared field becomes null.
      const includeBlank = isEdit || f.type === "bool" || f.type === "tags";
      if (coerced === null && !f.required && !includeBlank) continue;
      payload[f.field] = coerced;
    }

    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from(spec.table).update(payload).eq("id", row!.id as string));
    } else {
      payload.workspace_id = current.id;
      ({ error: err } = await supabase.from(spec.table).insert(payload));
    }

    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  async function del() {
    if (!isEdit) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from(spec.table).delete().eq("id", row!.id as string);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${isEdit ? "Edit" : "New"} ${spec.label}`}>
        <div className="dhead">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div className="k">{spec.label}</div>
              <div className="v">{isEdit ? "Edit" : "New"}</div>
            </div>
            <button className="x" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="dbody">
          {error && (
            <div role="alert" style={{
              border: "1px solid #e3b9b9", background: "#fbf2f2", color: "#912",
              borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {spec.fields.map((f) => (
            <div key={f.field} style={{ marginBottom: 12 }}>
              <label className="fk" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                {f.label}{f.required ? " *" : ""}
              </label>
              <FieldInput
                field={f}
                value={vals[f.field]}
                fkOptions={fkOptions[f.field]}
                onChange={(v) => set(f.field, v)}
              />
              {f.help && <div className="sub" style={{ fontSize: 11, marginTop: 3 }}>{f.help}</div>}
            </div>
          ))}

          <div className="row-actions" style={{ marginTop: 18 }}>
            <button className="btn" onClick={save} disabled={busy || missingRequired}>
              {busy ? "Saving…" : isEdit ? "Save changes" : `Create ${spec.label.toLowerCase()}`}
            </button>
            <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            {isEdit && !spec.appendOnly && (
              confirmDelete ? (
                <button className="btn ghost" style={{ color: "#b23", borderColor: "#e3b9b9", marginLeft: "auto" }}
                  onClick={del} disabled={busy}>
                  Confirm delete
                </button>
              ) : (
                <button className="btn ghost" style={{ color: "#b23", marginLeft: "auto" }}
                  onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Delete
                </button>
              )
            )}
          </div>

          {isEdit && extra && (
            <div style={{ marginTop: 24 }}>{extra}</div>
          )}
        </div>
      </aside>
    </>
  );
}

// ---- one input, by field type -------------------------------------------
function FieldInput({
  field, value, fkOptions, onChange,
}: {
  field: FormField;
  value: string | boolean;
  fkOptions?: FkOption[];
  onChange: (v: string | boolean) => void;
}) {
  if (field.type === "bool") {
    return (
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea className="input" rows={3} value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (field.type === "select" || field.fk) {
    const opts = field.fk ? (fkOptions ?? []).map((o) => ({ v: o.id, l: o.label }))
      : (field.options ?? []).map((o) => ({ v: o, l: o.replace(/_/g, " ") }));
    return (
      <select className="input" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.required ? "Select…" : "—"}</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }
  const inputType =
    field.type === "money" || field.type === "number" ? "number"
    : field.type === "date" ? "date"
    : field.type === "email" ? "email"
    : "text";
  return (
    <input
      className="input"
      type={inputType}
      step={field.type === "money" ? "0.01" : field.step}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.type === "money" ? "$ (dollars)" : undefined}
    />
  );
}

// ---- row value -> string/bool form state --------------------------------
function initValue(f: FormField, row: Row | null): string | boolean {
  if (f.type === "bool") return row ? Boolean(row[f.field]) : false;
  if (!row || row[f.field] == null) {
    // create defaults: required selects take their first option
    if (!row && f.required && f.type === "select" && f.options?.length) return f.options[0];
    return "";
  }
  const raw = row[f.field];
  if (f.type === "money") return String((raw as number) / 100);
  if (f.type === "tags") return Array.isArray(raw) ? (raw as string[]).join(", ") : "";
  if (f.type === "date") return String(raw).slice(0, 10);
  return String(raw);
}

// ---- form state -> DB value ---------------------------------------------
function coerce(f: FormField, v: string | boolean): unknown {
  if (f.type === "bool") return Boolean(v);
  const s = String(v ?? "").trim();
  if (f.type === "tags") return s === "" ? [] : s.split(",").map((t) => t.trim()).filter(Boolean);
  if (s === "") return null;
  if (f.type === "money") { const n = Math.round(parseFloat(s) * 100); return Number.isFinite(n) ? n : null; }
  if (f.type === "number") { const n = Number(s); return Number.isFinite(n) ? n : null; }
  return s; // text, textarea, email, select, fk, date (YYYY-MM-DD accepted by date & timestamptz)
}
