import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { isValidEmail } from "./passwordRules.js";

/** Red asterisk plus text, so "required" is never conveyed by colour alone. */
function RequiredMark() {
  return (
    <>
      <span className="zen-required" aria-hidden="true">
        {" *"}
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}

type Banner = { tone: "error" | "warning"; text: string } | null;

/**
 * Login — Lab 3 ui-spec.md §4.
 *
 * Email and password only: no registration, no "forgot password", and no
 * Development Requester selector.
 */
export default function Login() {
  const { signIn, notice } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function validate() {
    const errors: { email?: string; password?: string } = {};
    if (email.trim() === "") errors.email = "Email is required.";
    else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
    if (password === "") errors.password = "Password is required.";
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setBanner(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      // Success re-renders the app from AuthContext, so there is nothing more
      // to do here.
      await signIn(email.trim(), password);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        setBanner({ tone: "error", text: "Invalid email or password. Please try again." });
        setPassword("");
        passwordRef.current?.focus();
      } else if (status === 403) {
        setBanner({
          tone: "error",
          text: "This account cannot sign in. Contact your administrator.",
        });
      } else if (status === 429) {
        setBanner({
          tone: "warning",
          text: "Too many sign-in attempts. Try again in 15 minutes.",
        });
      } else if (status === 400 && err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
      } else {
        setBanner({ tone: "error", text: "Could not reach the server. Please try again." });
      }
      setIsSubmitting(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: 420 }}>
      <div className="zen-card p-4 p-md-5">
        <h1 className="zen-title h3 mb-1">TokTickIT</h1>
        <p className="text-secondary mb-4">Sign in to your account</p>

        {notice && !banner && (
          <div className="zen-success-banner mb-3" role="status">
            {notice}
          </div>
        )}

        {banner && (
          <div
            className={`alert ${banner.tone === "error" ? "zen-error-banner" : "zen-warning-banner"} mb-3`}
            role="alert"
          >
            {banner.text}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-label="Sign in">
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label fw-semibold">
              Email
              <RequiredMark />
            </label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              autoComplete="username"
              className={`form-control zen-input${fieldErrors.email ? " zen-invalid" : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              readOnly={isSubmitting}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="zen-error-text small mt-1 mb-0">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="login-password" className="form-label fw-semibold">
              Password
              <RequiredMark />
            </label>
            <div className="input-group">
              <input
                ref={passwordRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className={`form-control zen-input${fieldErrors.password ? " zen-invalid" : ""}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                readOnly={isSubmitting}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              />
              <button
                type="button"
                className="btn zen-btn-outline"
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="login-password-error" className="zen-error-text small mt-1 mb-0">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn zen-btn-primary w-100"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
