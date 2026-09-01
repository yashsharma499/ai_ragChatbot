import { Link } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import Icon from "../components/ui/Icon";

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? (user.role === "admin" ? "/admin" : "/dashboard") : "/login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Icon name="search" className="h-7 w-7 text-slate-500" strokeWidth={1.5} />
        </span>

        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-400">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The page you were looking for does not exist or has moved.
        </p>

        <Link
          to={home}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-colors hover:bg-indigo-500"
        >
          <Icon name="home" className="h-4 w-4" />
          {user ? "Back to dashboard" : "Go to sign in"}
        </Link>
      </div>
    </div>
  );
}
