import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Icon from "../components/ui/Icon";
import { useToast } from "../components/ui/toast-context";
import { useAuth } from "../context/auth-context";
import { authAPI } from "../services/api";
import AuthLayout from "./auth/AuthLayout";
import Field from "./auth/Field";
import {
  PASSWORD_RULES,
  passwordStrength,
  validateEmail,
  validateName,
  validateNewPassword,
} from "./auth/validators";

const VALIDATORS = {
  name: validateName,
  email: validateEmail,
  password: validateNewPassword,
};

function PasswordChecklist({ password }) {
  const strength = passwordStrength(password);

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Password strength
        </span>
        <span className={`text-[11px] font-bold ${strength.text}`}>{strength.label}</span>
      </div>

      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
          style={{ width: `${strength.score * 100}%` }}
        />
      </div>

      <ul className="grid gap-1.5">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password ?? "");
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-2 text-[11px] transition-colors ${
                met ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
                  met
                    ? "border-emerald-500/40 bg-emerald-500/20"
                    : "border-slate-700 bg-slate-800"
                }`}
              >
                {met && <Icon name="check" className="h-2 w-2" strokeWidth={3.5} />}
              </span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSubmitError("");
    if (touched[name]) {
      setErrors((current) => ({ ...current, [name]: VALIDATORS[name](value) }));
    }
  };

  const handleBlur = (event) => {
    const { name, value } = event.target;
    setTouched((current) => ({ ...current, [name]: true }));
    setErrors((current) => ({ ...current, [name]: VALIDATORS[name](value) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    const nextErrors = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
    };

    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      setTouched({ name: true, email: true, password: true });
      return;
    }

    setIsLoading(true);
    try {
      // The API signs the new account in directly, so there is no reason to
      // bounce the user to the login form and make them type it all again.
      const payload = await authAPI.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      const user = login(payload);

      toast.success(`Welcome, ${user.name || user.email}!`);
      navigate(user.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setSubmitError(err.message || "Sign up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const showChecklist = touched.password || form.password.length > 0;

  return (
    <AuthLayout
      icon="userPlus"
      title="Create account"
      subtitle="Get started with your new workspace"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-purple-400 transition-colors hover:text-purple-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      {submitError && (
        <div
          role="alert"
          className="animate-slideDown mb-4 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3"
        >
          <Icon name="warning" className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
          <p className="text-xs font-medium text-rose-300">{submitError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label="Full name"
          name="name"
          icon="user"
          placeholder="Ada Lovelace"
          autoComplete="name"
          value={form.name}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.name ? errors.name : ""}
          disabled={isLoading}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          icon="mail"
          placeholder="your@email.com"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.email ? errors.email : ""}
          disabled={isLoading}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          icon="lock"
          placeholder="••••••••••"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.password && !showChecklist ? errors.password : ""}
          disabled={isLoading}
        />

        {showChecklist && <PasswordChecklist password={form.password} />}

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all duration-200 hover:shadow-purple-900/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating account…
            </>
          ) : (
            <>
              Create account
              <Icon
                name="arrowRight"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
              />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
