import type { ReactElement } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import DocumentsPage from "./pages/DocumentsPage";
import SettingsPage from "./pages/SettingsPage";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full grid place-items-center"><Spinner size={22} /></div>;
  return user ? <Layout><Outlet /></Layout> : <Navigate to="/login" replace />;
}

function Public({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-full grid place-items-center"><Spinner size={22} /></div>;
  return user ? <Navigate to="/chat" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Public><AuthPage mode="login" /></Public>} />
      <Route path="/register" element={<Public><AuthPage mode="register" /></Public>} />
      <Route element={<Protected />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
