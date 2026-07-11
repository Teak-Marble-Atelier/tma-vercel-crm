import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Fail loud in dev; Dan sets these in .env / Vercel project vars.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

// Single browser client. Every query runs in the signed-in user's session,
// so Row-Level Security governs what the UI can see and change — the front
// end inherits the same isolation the database enforces.
export const supabase = createClient(url ?? "", anon ?? "");
