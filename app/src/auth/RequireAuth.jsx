import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
