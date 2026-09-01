import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../context/auth-context";
import { initials } from "../utils/format";
import Icon from "./ui/Icon";

const ADMIN_LINKS = [
  { to: "/admin", label: "Overview", icon: "home", end: true },
  { to: "/admin/users", label: "Users", icon: "users" },
  { to: "/admin/documents", label: "Documents", icon: "document" },
  { to: "/admin/queries", label: "Queries", icon: "chat" },
  { to: "/admin/usage", label: "Usage", icon: "chart" },
];

function RoleBadge({ role }) {
  const admin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        admin
          ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
          : "border-indigo-500/25 bg-indigo-500/10 text-indigo-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${admin ? "bg-rose-500" : "bg-indigo-500"}`}
      />
      {admin ? "Admin" : "Member"}
    </span>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);

  // The old Navbar read `user.email` unconditionally and crashed the whole
  // page during the brief window where user is null.
  const email = user?.email ?? "";
  const role = user?.role ?? "user";
  const isAdmin = role === "admin";
  const home = isAdmin ? "/admin" : "/dashboard";

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const linkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-white/10 text-white"
        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <button
          type="button"
          onClick={() => navigate(home)}
          className="group flex flex-shrink-0 items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-900/40 transition-transform group-hover:scale-105">
            <Icon name="spark" className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-bold tracking-tight text-white">
              Knowledge Assistant
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {isAdmin ? "Administration" : "Chat with your documents"}
            </span>
          </span>
        </button>

        {/* Admin navigation */}
        {isAdmin && (
          <div className="hidden flex-1 items-center gap-1 lg:flex">
            {ADMIN_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                <Icon name={link.icon} className="h-4 w-4" />
                {link.label}
              </NavLink>
            ))}
          </div>
        )}

        {/* Account */}
        <div className="flex items-center gap-3">
          <div className="hidden text-right md:block">
            <p className="max-w-[16rem] truncate text-sm font-semibold text-slate-200">
              {email}
            </p>
            <div className="mt-0.5 flex justify-end">
              <RoleBadge role={role} />
            </div>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold transition-all ${
                menuOpen
                  ? "border-indigo-500/50 bg-indigo-500/20 text-white"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
              }`}
            >
              {initials(email)}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="animate-slideDown absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
              >
                <div className="border-b border-white/5 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-200">{email}</p>
                  <div className="mt-1.5">
                    <RoleBadge role={role} />
                  </div>
                </div>

                <div className="p-1.5">
                  {/* The old menu nested an <a> inside a <button>, which is
                      invalid HTML and made the item unreliable to activate. */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(home);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Icon name="home" className="h-4 w-4 text-indigo-400" />
                    Dashboard
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Icon name="logout" className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:text-white lg:hidden"
            >
              <Icon name={mobileOpen ? "close" : "menu"} className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {isAdmin && mobileOpen && (
        <div className="animate-slideDown border-t border-white/5 bg-slate-950/95 px-4 py-3 lg:hidden">
          <div className="grid gap-1">
            {ADMIN_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMobileOpen(false)}
                className={linkClass}
              >
                <Icon name={link.icon} className="h-4 w-4" />
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
