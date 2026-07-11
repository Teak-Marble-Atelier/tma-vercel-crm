import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { when } from "../lib/format";
import type { Activity } from "../lib/types";

// The contact timeline. Every stage move writes a system activity here via
// the DB trigger, so a card's history reads like a story with no extra wiring.
export function Timeline({ contactId }: { contactId: string | null }) {
  const [events, setEvents] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!contactId) { setEvents([]); setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (alive) { setEvents((data as Activity[]) ?? []); setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [contactId]);

  if (!contactId) return <p className="sub">No contact linked — no timeline yet.</p>;
  if (loading) return <p className="sub">Loading timeline…</p>;
  if (!events.length) return <p className="sub">Nothing logged yet.</p>;

  return (
    <div className="tl">
      {events.map((e) => (
        <div className="ev" key={e.id}>
          <div className="es">{e.subject ?? e.type}</div>
          {e.body && <div className="eb">{e.body}</div>}
          <div className="ed">{e.type} · {when(e.occurred_at)}</div>
        </div>
      ))}
    </div>
  );
}
