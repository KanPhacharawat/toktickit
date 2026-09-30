import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createAdminUser,
  fetchAdminUsers,
  setAdminUserInitialPassword,
  updateAdminUser,
  type AdminRole,
  type AdminUser,
} from "./api.js";
import { useAuth } from "./AuthContext.js";
import { ROLE_LABELS } from "./authApi.js";
import { passwordRules } from "./passwordRules.js";

const ROLES: AdminRole[] = ["Requester", "ITStaff", "Administrator"];

function PasswordChecklist({ password, email }: { password: string; email: string }) {
  const rules = passwordRules(password, { email });
  return (
    <ul className="list-unstyled small mb-3" data-testid="password-rules">
      {rules.map((rule) => (
        <li key={rule.id} className={rule.met ? "zen-rule-met" : "zen-rule-unmet"} data-rule={rule.id}>
          <span aria-hidden="true" className="me-2">
            {rule.met ? "✓" : "✗"}
          </span>
          {rule.label}
          <span className="visually-hidden">{rule.met ? " — met" : " — not met"}</span>
        </li>
      ))}
    </ul>
  );
}

function passwordFieldErrors(
  password: string,
  confirm: string,
  email: string,
): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {};
  const rules = passwordRules(password, { email });
  if (rules.some((r) => !r.met)) errors.password = "Password does not meet every rule above.";
  if (confirm !== password) errors.confirm = "Passwords do not match.";
  return errors;
}

interface CreateFormState {
  name: string;
  email: string;
  role: AdminRole | "";
  isActive: boolean;
  password: string;
  confirm: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  name: "",
  email: "",
  role: "",
  isActive: true,
  password: "",
  confirm: "",
};

function CreateUserPanel({
  onSaved,
  onCancel,
}: {
  onSaved: (user: AdminUser) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  function update<K extends keyof CreateFormState>(field: K, value: CreateFormState[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError("");

    const errors: Record<string, string> = {};
    if (values.name.trim().length < 2 || values.name.trim().length > 100) {
      errors.name = "Name must be 2–100 characters.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (!values.role) errors.role = "Select a role.";
    const pwErrors = passwordFieldErrors(values.password, values.confirm, values.email);
    if (pwErrors.password) errors.initialPassword = pwErrors.password;
    if (pwErrors.confirm) errors.confirmInitialPassword = pwErrors.confirm;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const created = await createAdminUser({
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role as AdminRole,
        isActive: values.isActive,
        initialPassword: values.password,
      });
      onSaved(created);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError(
          err instanceof ApiError ? err.message : "Could not create the user. Please try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="zen-card p-4" aria-label="Create New User">
      <h2 className="zen-title h5 mb-3">Create New User</h2>
      {formError && (
        <div className="alert zen-error-banner" role="alert">
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="create-name" className="form-label fw-semibold">
            Full Name
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <input
            id="create-name"
            className={`form-control zen-input${fieldErrors.name ? " zen-invalid" : ""}`}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "create-name-error" : undefined}
          />
          {fieldErrors.name && (
            <p id="create-name-error" className="zen-error-text small mt-1 mb-0">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="create-email" className="form-label fw-semibold">
            Email Address
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <input
            id="create-email"
            type="email"
            className={`form-control zen-input${fieldErrors.email ? " zen-invalid" : ""}`}
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "create-email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="create-email-error" className="zen-error-text small mt-1 mb-0">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="create-role" className="form-label fw-semibold">
            Role
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <select
            id="create-role"
            className={`form-select zen-select${fieldErrors.role ? " zen-invalid" : ""}`}
            value={values.role}
            onChange={(e) => update("role", e.target.value as AdminRole)}
            aria-invalid={fieldErrors.role ? true : undefined}
            aria-describedby={fieldErrors.role ? "create-role-error" : undefined}
          >
            <option value="">Select a role…</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {fieldErrors.role && (
            <p id="create-role-error" className="zen-error-text small mt-1 mb-0">
              {fieldErrors.role}
            </p>
          )}
        </div>

        <div className="mb-3 form-check form-switch">
          <input
            id="create-active"
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={values.isActive}
            onChange={(e) => update("isActive", e.target.checked)}
          />
          <label className="form-check-label" htmlFor="create-active">
            Active
          </label>
        </div>

        <div className="mb-1">
          <label htmlFor="create-password" className="form-label fw-semibold">
            Initial Password
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <input
            id="create-password"
            type="password"
            autoComplete="new-password"
            className={`form-control zen-input${fieldErrors.initialPassword ? " zen-invalid" : ""}`}
            value={values.password}
            onChange={(e) => update("password", e.target.value)}
            aria-invalid={fieldErrors.initialPassword ? true : undefined}
          />
          {fieldErrors.initialPassword && (
            <p className="zen-error-text small mt-1 mb-0">{fieldErrors.initialPassword}</p>
          )}
        </div>
        <PasswordChecklist password={values.password} email={values.email} />

        <div className="mb-3">
          <label htmlFor="create-confirm-password" className="form-label fw-semibold">
            Confirm Initial Password
            <span className="zen-required" aria-hidden="true">
              {" *"}
            </span>
            <span className="visually-hidden"> (required)</span>
          </label>
          <input
            id="create-confirm-password"
            type="password"
            autoComplete="new-password"
            className={`form-control zen-input${fieldErrors.confirmInitialPassword ? " zen-invalid" : ""}`}
            value={values.confirm}
            onChange={(e) => update("confirm", e.target.value)}
          />
          {fieldErrors.confirmInitialPassword && (
            <p className="zen-error-text small mt-1 mb-0">{fieldErrors.confirmInitialPassword}</p>
          )}
        </div>

        <p className="text-secondary small">
          The user must change this password at first sign-in. Share it with them directly; no
          email is sent.
        </p>

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" className="btn zen-btn-primary" disabled={saving} aria-busy={saving}>
            {saving ? "Saving…" : "Save User"}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function EditUserPanel({
  user,
  isSelf,
  onSaved,
  onSelfDeactivated,
  onCancel,
}: {
  user: AdminUser;
  isSelf: boolean;
  onSaved: (user: AdminUser, unassignedTicketCount: number) => void;
  onSelfDeactivated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFieldError, setPasswordFieldError] = useState<Record<string, string>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetError, setResetError] = useState("");

  const dirty =
    name.trim() !== user.name || email.trim() !== user.email || role !== user.role || isActive !== user.isActive;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !dirty) return;
    setFormError("");

    const errors: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 100) errors.name = "Name must be 2–100 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const result = await updateAdminUser(user.id, {
        ...(name.trim() !== user.name ? { name: name.trim() } : {}),
        ...(email.trim() !== user.email ? { email: email.trim() } : {}),
        ...(role !== user.role ? { role } : {}),
        ...(isActive !== user.isActive ? { isActive } : {}),
      });
      if (isSelf && isActive === false) {
        onSelfDeactivated();
        return;
      }
      onSaved(result.data, result.meta.unassignedTicketCount);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "SELF_DEACTIVATION_BLOCKED") {
          setFormError("You cannot deactivate your own account.");
        } else if (err.code === "LAST_ACTIVE_ADMINISTRATOR") {
          setFormError(
            "At least one active administrator is required. Make another user an active administrator first.",
          );
        } else if (err.code === "EMAIL_ALREADY_IN_USE") {
          setFieldErrors({ email: "This email is already used by another account." });
        } else if (Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Could not update the user. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmReset() {
    if (resettingPassword) return;
    setResettingPassword(true);
    setResetError("");
    try {
      await setAdminUserInitialPassword(user.id, newPassword);
      setConfirmingReset(false);
      if (isSelf) {
        onSelfDeactivated(); // Reuse: routes to Login, since the caller's own session ends too.
        return;
      }
      setResetSuccess(`New initial password set. ${user.name} has been signed out.`);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setResetError(
        err instanceof ApiError ? err.message : "Could not set the password. Please try again.",
      );
    } finally {
      setResettingPassword(false);
    }
  }

  function requestReset(event: React.FormEvent) {
    event.preventDefault();
    const errors = passwordFieldErrors(newPassword, confirmPassword, email);
    const mapped: Record<string, string> = {};
    if (errors.password) mapped.newPassword = errors.password;
    if (errors.confirm) mapped.confirm = errors.confirm;
    setPasswordFieldError(mapped);
    if (Object.keys(mapped).length > 0) return;
    setConfirmingReset(true);
  }

  return (
    <section className="zen-card p-4" aria-label="Edit User">
      <h2 className="zen-title h5 mb-3">Edit User</h2>
      {formError && (
        <div className="alert zen-error-banner mb-3" role="alert">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="edit-name" className="form-label fw-semibold">
            Full Name
          </label>
          <input
            id="edit-name"
            className={`form-control zen-input${fieldErrors.name ? " zen-invalid" : ""}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {fieldErrors.name && <p className="zen-error-text small mt-1 mb-0">{fieldErrors.name}</p>}
        </div>

        <div className="mb-3">
          <label htmlFor="edit-email" className="form-label fw-semibold">
            Email Address
          </label>
          <input
            id="edit-email"
            type="email"
            className={`form-control zen-input${fieldErrors.email ? " zen-invalid" : ""}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email && <p className="zen-error-text small mt-1 mb-0">{fieldErrors.email}</p>}
        </div>

        <div className="mb-3">
          <label htmlFor="edit-role" className="form-label fw-semibold">
            Role
          </label>
          <select
            id="edit-role"
            className="form-select zen-select"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {role !== user.role && (user.role === "ITStaff" || user.role === "Administrator") && (
            <p className="text-secondary small mt-1 mb-0">Their active tickets will become unassigned.</p>
          )}
        </div>

        <div className="mb-3 form-check form-switch">
          <input
            id="edit-active"
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={isActive}
            disabled={isSelf}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="edit-active">
            Active
          </label>
          {isSelf ? (
            <p className="text-secondary small mt-1 mb-0">You cannot deactivate your own account.</p>
          ) : (
            isActive === false && (
              <p className="text-secondary small mt-1 mb-0">
                Deactivating signs the user out immediately and unassigns their active tickets. The
                account is kept, not deleted.
              </p>
            )
          )}
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn zen-btn-primary"
            disabled={saving || !dirty}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" className="btn zen-btn-outline" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>

      <hr className="my-4" />

      <h3 className="zen-title h6 mb-2">Set New Initial Password</h3>
      <p className="text-secondary small">
        Sets a temporary password. The user is signed out and must change it at next sign-in.
      </p>
      {isSelf && <p className="text-secondary small">You will be signed out now.</p>}

      {resetSuccess && (
        <div className="zen-success-banner mb-3" role="status">
          {resetSuccess}
        </div>
      )}
      {resetError && (
        <div className="alert zen-error-banner mb-3" role="alert">
          {resetError}
        </div>
      )}

      <form onSubmit={requestReset} noValidate>
        <div className="mb-1">
          <label htmlFor="reset-password" className="form-label fw-semibold">
            New Initial Password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            className={`form-control zen-input${passwordFieldError.newPassword ? " zen-invalid" : ""}`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {passwordFieldError.newPassword && (
            <p className="zen-error-text small mt-1 mb-0">{passwordFieldError.newPassword}</p>
          )}
        </div>
        <PasswordChecklist password={newPassword} email={email} />

        <div className="mb-3">
          <label htmlFor="reset-confirm" className="form-label fw-semibold">
            Confirm New Initial Password
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            className={`form-control zen-input${passwordFieldError.confirm ? " zen-invalid" : ""}`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordFieldError.confirm && (
            <p className="zen-error-text small mt-1 mb-0">{passwordFieldError.confirm}</p>
          )}
        </div>

        <button type="submit" className="btn zen-btn-outline">
          Set New Initial Password
        </button>
      </form>

      {confirmingReset && (
        <div role="dialog" aria-modal="true" aria-label="Confirm new initial password" className="zen-card p-3 mt-3">
          <p className="mb-3">{`Sign ${user.name} out and require a password change?`}</p>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn zen-btn-primary"
              onClick={confirmReset}
              disabled={resettingPassword}
              aria-busy={resettingPassword}
            >
              {resettingPassword ? "Setting…" : "Confirm"}
            </button>
            <button
              type="button"
              className="btn zen-btn-outline"
              onClick={() => setConfirmingReset(false)}
              disabled={resettingPassword}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function UserManagement({ onSelfDeactivated }: { onSelfDeactivated: () => void }) {
  const { user: currentUser, retrySessionCheck } = useAuth();

  const [searchDraft, setSearchDraft] = useState("");
  const [controls, setControls] = useState<{ search: string; role: AdminRole | "" }>({
    search: "",
    role: "",
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [panel, setPanel] = useState<"closed" | "create" | "edit">("closed");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [successBanner, setSuccessBanner] = useState("");
  const [pendingClose, setPendingClose] = useState(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");
    try {
      const response = await fetchAdminUsers(controls);
      setUsers(response.data);
      setLoadState("ready");
    } catch (err) {
      setUsers([]);
      setErrorMessage(
        err instanceof ApiError ? err.message : "Could not load users. Please try again.",
      );
      setLoadState("error");
    }
  }, [controls]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  function closePanel() {
    setPanel("closed");
    setEditingUser(null);
    setPendingClose(false);
  }

  function requestClosePanel() {
    // A dirty check happens inside each panel; here we simply confirm intent
    // for edit mode, since create has no meaningful "unsaved" concept beyond
    // its own fields.
    if (panel === "edit") {
      setPendingClose(true);
    } else {
      closePanel();
    }
  }

  if (!currentUser) return null;

  const filtersActive = Boolean(controls.search || controls.role);

  return (
    <main className="container py-4">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="zen-title h4 mb-0 me-auto">User Management</h1>
        <button
          type="button"
          className="btn zen-btn-primary"
          onClick={() => {
            setPanel("create");
            setEditingUser(null);
          }}
        >
          Create User
        </button>
      </div>

      {successBanner && (
        <div className="zen-success-banner mb-3" role="status">
          {successBanner}
        </div>
      )}

      <section className="zen-card p-3 p-md-4 mb-3" aria-label="Search users">
        <form
          className="row g-3 align-items-end"
          role="search"
          aria-label="Search users"
          onSubmit={(e) => {
            e.preventDefault();
            setControls((current) => ({ ...current, search: searchDraft.trim() }));
          }}
        >
          <div className="col-12 col-md-5">
            <label className="form-label fw-semibold" htmlFor="user-search">
              Search
            </label>
            <div className="d-flex gap-2">
              <input
                id="user-search"
                className="form-control zen-input"
                placeholder="Name or email"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
              <button type="submit" className="btn zen-btn-primary flex-shrink-0">
                Search
              </button>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label fw-semibold" htmlFor="user-role-filter">
              Role
            </label>
            <select
              id="user-role-filter"
              className="form-select zen-select"
              value={controls.role}
              onChange={(e) =>
                setControls((current) => ({ ...current, role: e.target.value as AdminRole | "" }))
              }
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <button
              type="button"
              className="btn zen-btn-outline w-100"
              disabled={!filtersActive}
              onClick={() => {
                setSearchDraft("");
                setControls({ search: "", role: "" });
              }}
            >
              Clear
            </button>
          </div>
        </form>
      </section>

      {loadState === "ready" && (
        <p className="text-secondary small" role="status">
          {`${users.length} ${users.length === 1 ? "user" : "users"}`}
        </p>
      )}

      {loadState === "loading" && (
        <div className="zen-card p-4" role="status" aria-live="polite">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          Loading users…
        </div>
      )}

      {loadState === "error" && (
        <div className="zen-card p-4">
          <div className="alert zen-error-banner" role="alert">
            <strong>Could not load users.</strong>
            <p className="mb-0 mt-1 small">{errorMessage}</p>
          </div>
          <button type="button" className="btn zen-btn-outline" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </button>
        </div>
      )}

      {loadState === "ready" && users.length === 0 && (
        <div className="zen-card p-4 text-center" data-testid="no-results-state">
          <p className="fw-semibold mb-1">No users match your search.</p>
          <button
            type="button"
            className="btn zen-btn-outline"
            onClick={() => {
              setSearchDraft("");
              setControls({ search: "", role: "" });
            }}
          >
            Clear
          </button>
        </div>
      )}

      {loadState === "ready" && users.length > 0 && (
        <div className="row g-3">
          <div className={panel === "closed" ? "col-12" : "col-12 col-lg-7"}>
            <div className="zen-card table-responsive">
              <table className="table zen-table mb-0">
                <caption className="visually-hidden">Users</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody data-testid="user-rows">
                  {users.map((row) => (
                    <tr key={row.id} aria-current={editingUser?.id === row.id ? "true" : undefined}>
                      <td>
                        {row.name}
                        {row.id === currentUser.id && " (you)"}
                      </td>
                      <td className="text-break">{row.email}</td>
                      <td>
                        <span className="zen-badge zen-status">{ROLE_LABELS[row.role]}</span>
                      </td>
                      <td>
                        <span className={`zen-badge ${row.isActive ? "zen-status" : "zen-priority-low"}`}>
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                        {row.mustChangePassword && (
                          <div className="text-secondary small">Must change password</div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm zen-btn-outline"
                          onClick={() => {
                            setEditingUser(row);
                            setPanel("edit");
                            setSuccessBanner("");
                          }}
                        >
                          Edit
                          <span className="visually-hidden">{` ${row.name}`}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {panel !== "closed" && (
            <div className="col-12 col-lg-5">
              {panel === "create" && (
                <CreateUserPanel
                  onSaved={(created) => {
                    closePanel();
                    setSuccessBanner(`Saved changes to ${created.name}.`);
                    setReloadToken((t) => t + 1);
                  }}
                  onCancel={requestClosePanel}
                />
              )}
              {panel === "edit" && editingUser && (
                <EditUserPanel
                  user={editingUser}
                  isSelf={editingUser.id === currentUser.id}
                  onSaved={(updated, unassignedTicketCount) => {
                    closePanel();
                    setSuccessBanner(
                      `Saved changes to ${updated.name}.` +
                        (unassignedTicketCount > 0
                          ? ` ${unassignedTicketCount} active tickets were unassigned.`
                          : ""),
                    );
                    setReloadToken((t) => t + 1);
                    if (editingUser.id === currentUser.id && updated.role !== "Administrator") {
                      retrySessionCheck();
                    }
                  }}
                  onSelfDeactivated={onSelfDeactivated}
                  onCancel={requestClosePanel}
                />
              )}
            </div>
          )}
        </div>
      )}

      {pendingClose && (
        <div role="dialog" aria-modal="true" aria-label="Discard unsaved changes" className="zen-card p-3 mt-3">
          <p className="mb-3">Discard unsaved changes?</p>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn zen-btn-primary" onClick={closePanel}>
              Discard
            </button>
            <button type="button" className="btn zen-btn-outline" onClick={() => setPendingClose(false)}>
              Keep Editing
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
