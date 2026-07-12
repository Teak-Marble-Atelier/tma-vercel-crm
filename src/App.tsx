import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./state/Session";
import { Login } from "./components/Login";
import { AppShell } from "./components/AppShell";
import { PipelineBoard } from "./components/PipelineBoard";
import { ContactsView } from "./components/ContactsView";
import { RecordsView } from "./components/RecordsView";
import { QuoteBuilder } from "./components/QuoteBuilder";
import QuotePage from "./public/QuotePage";
import StatusPage from "./public/StatusPage";
import UnsubscribePage from "./public/UnsubscribePage";
import "./public/public.css";

export default function App() {
  const { session, loading } = useSession();

  return (
    <Routes>
      {/* PUBLIC customer surfaces — token-gated, no CRM session. Declared
          BEFORE the auth gate so a customer link never hits <Login>. */}
      <Route path="/q/:token" element={<QuotePage />} />
      <Route path="/status/:token" element={<StatusPage />} />
      <Route path="/unsubscribe" element={<UnsubscribePage />} />

      {/* Everything else is the internal CRM, behind auth. */}
      <Route path="*" element={<CrmApp session={session} loading={loading} />} />
    </Routes>
  );
}

function CrmApp({ session, loading }: { session: unknown; loading: boolean }) {
  if (loading) return <div className="center-note">Loading…</div>;
  if (!session) return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/board" element={<PipelineBoard />} />
        <Route path="/contacts" element={<ContactsView />} />
        <Route path="/records/:key" element={<RecordsView />} />
        <Route path="/quote/new" element={<QuoteBuilder />} />
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Route>
    </Routes>
  );
}
