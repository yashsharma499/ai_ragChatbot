import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import Icon from "../components/ui/Icon";
import { useAuth } from "../context/auth-context";
import { authAPI } from "../services/api";
import AuthLayout from "./auth/AuthLayout";
import Field from "./auth/Field";
import { validateEmail, validateLoginPassword } from "./auth/validators";

const VALIDATORS = {
  email: validateEmail,
  password: validateLoginPassword,
};

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const sessionExpired = searchParams.get("expired") === "1";

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
      email: validateEmail(form.email),
      password: validateLoginPassword(form.password),
    };

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      setTouched({ email: true, password: true });
      return;
    }

    setIsLoading(true);
    try {
      const payload = await authAPI.login({
        email: form.email.trim(),
        password: form.password,
      });
      const user = login(payload);

      // Return them to whatever they were trying to reach, if anything.
      const target =
        location.state?.from?.pathname ??
        (user.role === "admin" ? "/admin" : "/dashboard");
      navigate(target, { replace: true });
    } catch (err) {
      // `err.message` is populated by the API layer for every failure mode,
      // including network errors and rate limiting.
      setSubmitError(err.message || "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      icon="shield"
      title="Welcome back"
      subtitle="Sign in to continue to your workspace"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            className="font-semibold text-purple-400 transition-colors hover:text-purple-300"
          >
            Sign up for free
          </Link>
        </>
      }
    >
      {sessionExpired && !submitError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <Icon name="clock" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs font-medium text-amber-200">
            Your session expired. Please sign in again.
          </p>
        </div>
      )}

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
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.password ? errors.password : ""}
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all duration-200 hover:shadow-purple-900/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
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
