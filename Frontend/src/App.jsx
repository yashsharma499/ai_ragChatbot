import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./context/auth-context";
import ProtectedRoute from "./routes/ProtectedRoute";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";

import UserDashboard from "./pages/user/Dashboard";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/Users";
import AdminDocuments from "./pages/admin/Documents";
import AdminQueries from "./pages/admin/Queries";
import AdminUsage from "./pages/admin/Usage";

/** Sends an already-signed-in visitor away from the auth pages. */
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
  return children;
}

/** `/` resolves to whichever home matches the current role. */
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

const adminRoutes = [
  { path: "/admin", element: <AdminDashboard /> },
  { path: "/admin/users", element: <AdminUsers /> },
  { path: "/admin/documents", element: <AdminDocuments /> },
  { path: "/admin/queries", element: <AdminQueries /> },
  { path: "/admin/usage", element: <AdminUsage /> },
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <Signup />
          </PublicOnly>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute role="user">
            <UserDashboard />
          </ProtectedRoute>
        }
      />

      {adminRoutes.map(({ path, element }) => (
        <Route
          key={path}
          path={path}
          element={<ProtectedRoute role="admin">{element}</ProtectedRoute>}
        />
      ))}

      {/* An unknown URL now shows a 404 instead of silently bouncing a
          signed-in user to the login page. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
