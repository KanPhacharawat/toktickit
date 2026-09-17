import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { changePassword } from "./authApi.js";
import { passwordRules } from "./passwordRules.js";

type Field = "currentPassword" | "newPassword" | "confirmPassword";
type FieldErrors = Partial<Record<Field, string>>;

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

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  shown,
  onToggle,
  readOnly,
  inputRef,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  shown: boolean;
  onToggle: () => void;
  readOnly: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  describedBy?: string;
}) {
  const errorId = `${id}-error`;
  const describedByIds = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(" ");
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-semibold">
        {label}
        <RequiredMark />
      </label>
      <div className="input-group">
        <input
          ref={inputRef}
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          className={`form-control zen-input${error ? " zen-invalid" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds || undefined}
        />
        <button
          type="button"
          className="btn zen-btn-outline"
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={onToggle}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {error && (
        <p id={errorId} className="zen-error-text small mt-1 mb-0">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Change Password — Lab 3 ui-spec.md §5.
 *
 * `mandatory`: the user must change an initial password before entering the
 * app, so there is no way back. `voluntary`: opened from the profile menu,
 * with Cancel.
 */
export default function ChangePassword({ mode }: { mode: "mandatory" | "voluntary" }) {
  const { user, passwordChanged, closeChangePassword } = useAuth();

  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [shown, setShown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  if (!user) return null;

  const rules = passwordRules(values.newPassword, {
    email: user.email,
    currentPassword: values.currentPassword,
  });

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (values.currentPassword === "") errors.currentPassword = "Current password is required.";
    if (values.newPassword === "") {
      errors.newPassword = "New password is required.";
    } else if (rules.some((rule) => !rule.met)) {
      errors.newPassword = "Your new password does not meet every rule below.";
    }
    if (values.confirmPassword === "") {
      errors.confirmPassword = "Confirm your new password.";
    } else if (values.confirmPassword !== values.newPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError("");
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const updated = await changePassword(values.currentPassword, values.newPassword);
      passwordChanged(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors as FieldErrors);
      } else {
        setFormError(
          err instanceof ApiError && err.status !== 0
            ? err.message
            : "Could not reach the server. Please try again.",
        );
      }
      setIsSubmitting(false);
    }
  }

  const mandatory = mode === "mandatory";

  return (
    <main className="container py-5" style={{ maxWidth: 480 }}>
      <div className="zen-card p-4 p-md-5">
        <h1 className="zen-title h4 mb-3">
          {mandatory ? "Change your password" : "Change Password"}
        </h1>

        {mandatory && (
          <div className="alert zen-warning-banner mb-4" role="note">
            You must change your password before continuing.
          </div>
        )}

        {formError && (
          <div className="alert zen-error-banner mb-3" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-label="Change password">
          <PasswordInput
            id="current-password"
            label={mandatory ? "Current (temporary) password" : "Current password"}
            value={values.currentPassword}
            onChange={(value) => update("currentPassword", value)}
            autoComplete="current-password"
            error={fieldErrors.currentPassword}
            shown={shown}
            onToggle={() => setShown((s) => !s)}
            readOnly={isSubmitting}
            inputRef={currentRef}
          />
          <PasswordInput
            id="new-password"
            label="New password"
            value={values.newPassword}
            onChange={(value) => update("newPassword", value)}
            autoComplete="new-password"
            error={fieldErrors.newPassword}
            shown={shown}
            onToggle={() => setShown((s) => !s)}
            readOnly={isSubmitting}
            describedBy="password-rules"
          />

          <div className="mb-3">
            <p className="small fw-semibold mb-1" id="password-rules-heading">
              Password must:
            </p>
            <ul
              id="password-rules"
              className="list-unstyled small mb-0"
              aria-labelledby="password-rules-heading"
              data-testid="password-rules"
            >
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={rule.met ? "zen-rule-met" : "zen-rule-unmet"}
                  data-rule={rule.id}
                  data-met={rule.met}
                >
                  <span aria-hidden="true" className="me-2">
                    {rule.met ? "✓" : "✗"}
                  </span>
                  {rule.label}
                  <span className="visually-hidden">{rule.met ? " — met" : " — not met"}</span>
                </li>
              ))}
            </ul>
          </div>

          <PasswordInput
            id="confirm-password"
            label="Confirm new password"
            value={values.confirmPassword}
            onChange={(value) => update("confirmPassword", value)}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
            shown={shown}
            onToggle={() => setShown((s) => !s)}
            readOnly={isSubmitting}
          />

          <div className="d-flex flex-wrap gap-2 mt-4">
            <button
              type="submit"
              className="btn zen-btn-primary flex-grow-1"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Saving…" : "Save Password"}
            </button>
            {!mandatory && (
              <button
                type="button"
                className="btn zen-btn-outline"
                onClick={closeChangePassword}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
