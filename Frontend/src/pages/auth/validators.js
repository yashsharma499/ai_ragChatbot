/**
 * Client-side rules that mirror the server exactly (see Backend/app/routes/auth.py).
 *
 * They used to disagree: the form accepted any 6-character password while the
 * API required 8 characters with mixed case and a digit, so a valid-looking
 * form produced a server error the user could not predict.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "One number", test: (v) => /\d/.test(v) },
];

export function validateEmail(email) {
  const value = (email ?? "").trim();
  if (!value) return "Email is required";
  if (!EMAIL_RE.test(value)) return "Enter a valid email address";
  return "";
}

export function validateName(name) {
  const value = (name ?? "").trim();
  if (!value) return "Name is required";
  if (value.length < 2) return "Name must be at least 2 characters";
  if (value.length > 80) return "Name must be at most 80 characters";
  return "";
}

/** Full strength rules — used on signup. */
export function validateNewPassword(password) {
  const value = password ?? "";
  if (!value) return "Password is required";

  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(value));
  if (unmet.length === 0) return "";
  if (unmet.length === 1) return `Password needs: ${unmet[0].label.toLowerCase()}`;
  return "Password does not meet all the requirements below";
}

/**
 * Login only checks presence. Enforcing strength rules here would lock out any
 * account created before the rules changed.
 */
export function validateLoginPassword(password) {
  if (!password) return "Password is required";
  return "";
}

export function passwordStrength(password) {
  const value = password ?? "";
  const met = PASSWORD_RULES.filter((rule) => rule.test(value)).length;
  const score = value ? met / PASSWORD_RULES.length : 0;

  if (score === 1) return { score, label: "Strong", color: "bg-emerald-500", text: "text-emerald-400" };
  if (score >= 0.75) return { score, label: "Good", color: "bg-cyan-500", text: "text-cyan-400" };
  if (score >= 0.5) return { score, label: "Fair", color: "bg-amber-500", text: "text-amber-400" };
  return { score, label: "Weak", color: "bg-rose-500", text: "text-rose-400" };
}
