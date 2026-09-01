import { useId, useState } from "react";
import Icon from "../../components/ui/Icon";

/** A labelled input with an icon, inline validation and password reveal. */
export default function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  onBlur,
  error,
  icon,
  placeholder,
  autoComplete,
  hint,
  disabled,
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;
  const showError = Boolean(error);
  const describedBy = showError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-300">
        {label}
      </label>

      <div className="group relative">
        <span
          className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 transition-colors ${
            showError ? "text-rose-400" : "text-slate-500 group-focus-within:text-purple-400"
          }`}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>

        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={showError || undefined}
          aria-describedby={describedBy}
          className={`autofill-dark w-full rounded-lg border-2 bg-slate-900/50 py-2.5 pl-10 text-sm text-white placeholder-slate-500 outline-none backdrop-blur-sm transition-all duration-200 focus:bg-slate-900/80 focus:ring-4 disabled:opacity-60 ${
            isPassword ? "pr-10" : "pr-3"
          } ${
            showError
              ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20"
              : "border-slate-800 focus:border-purple-500 focus:ring-purple-500/20"
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 transition-colors hover:text-purple-400"
          >
            <Icon name={revealed ? "eyeOff" : "eye"} className="h-4 w-4" />
          </button>
        )}
      </div>

      {showError ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1 text-[11px] font-medium text-rose-400"
        >
          <Icon name="warning" className="mt-px h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-[11px] text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
