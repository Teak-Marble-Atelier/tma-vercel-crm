import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./state/Session";
import { Login } from "./components/Login";
import { AppShell } from "./components/AppShell";
import { PipelineBoard } from "./components/PipelineBoard";
import { ContactsView } from "./components/ContactsView";
import { RecordsView } from "./components/RecordsView";

export default function App() {
  const { session, loading } = useSession();
  if (loading) return <div className="center-note">Loading…</div>;
  if (!session) return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/board" element={<PipelineBoard />} />
        <Route path="/contacts" element={<ContactsView />} />
        <Route path="/records/:key" element={<RecordsView />} />
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Route>
    </Routes>
  );
}
