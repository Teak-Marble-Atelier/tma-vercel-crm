import { money } from "../lib/format";
import { Timeline } from "./Timeline";
import type { PipelineRow } from "../lib/types";

// Slide-over for a pipeline card: key fields + the contact timeline.
export function RecordDrawer(
  { row, contactName, valueFields, onClose }:
  { row: PipelineRow; contactName: string; valueFields: string[]; onClose: () => void },
) {
  const val = valueFields
    .map((f) => (row as unknown as Record<string, unknown>)[f] as number | null | undefined)
    .find((v) => v != null);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={row.title}>
        <div className="dhead">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div className="k">{row.stage.replace(/_/g, " ")}</div>
              <div className="v">{row.title}</div>
            </div>
            <button className="x" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <div className="dbody">
          <div className="field"><span className="fk">Contact</span><span>{contactName || "—"}</span></div>
          <div className="field"><span className="fk">Value</span><span className="money">{money(val)}</span></div>
          <div className="field"><span className="fk">Source</span><span>{row.source ?? "—"}</span></div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", margin: "22px 0 4px" }}>
            Timeline
          </h3>
          <Timeline contactId={row.contact_id} />
        </div>
      </aside>
    </>
  );
}
