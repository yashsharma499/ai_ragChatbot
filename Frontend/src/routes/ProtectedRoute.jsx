import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { Spinner } from "../components/ui/States";

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // A blank screen while the session is verified looks like a broken app.
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#020617]">
        <Spinner className="h-8 w-8" label="Restoring your session" />
        <p className="text-sm font-medium text-slate-500">Restoring your session…</p>
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Sending an admin who lands on /dashboard back to /login was a redirect loop
  // in the old version; route them to their own home instead.
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
  }

  return children;
}
