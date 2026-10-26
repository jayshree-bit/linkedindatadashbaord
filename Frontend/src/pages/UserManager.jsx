import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchUsers,
  fetchRoles,
  addUser,
  editUser,
  changeUserRole,
  changePassword,
  removeUser,
  saveRolePermissions,
  clearError,
} from "../features/usersSlice";
import { can } from "../features/authSlice";

const RESOURCES = ["prospect", "company", "user"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/20";

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-500/20 dark:disabled:bg-slate-800/50";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60";

const cardClass =
  "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900";

const labelClass =
  "mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200";

function SectionHeading({ eyebrow, title, description, count }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>

      {count !== undefined && (
        <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {count} records
        </span>
      )}
    </div>
  );
}

function EditUserModal({ user, roles, onClose }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    name: user.name || "",
    username: user.username || "",
    phone: user.phone || "",
    roleId: user.role?._id || "",
    password: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = { ...form };
    if (!body.password) delete body.password; // blank = keep current password
    const res = await dispatch(editUser({ id: user._id, body }));
    setSaving(false);
    if (!res.error) onClose();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={submit}
        className={`${cardClass} w-full max-w-lg space-y-4 p-6`}
      >
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Edit {user.email}
        </h3>

        <div>
          <label htmlFor="edit-name" className={labelClass}>
            Full name
          </label>
          <input
            id="edit-name"
            className={inputClass}
            value={form.name}
            onChange={set("name")}
          />
        </div>

        <div>
          <label htmlFor="edit-username" className={labelClass}>
            Username
          </label>
          <input
            id="edit-username"
            className={inputClass}
            value={form.username}
            onChange={set("username")}
          />
        </div>

        <div>
          <label htmlFor="edit-phone" className={labelClass}>
            Phone
          </label>
          <input
            id="edit-phone"
            className={inputClass}
            type="tel"
            value={form.phone}
            onChange={set("phone")}
          />
        </div>

        <div>
          <label htmlFor="edit-role" className={labelClass}>
            Role
          </label>
          <select
            id="edit-role"
            className={selectClass}
            value={form.roleId}
            onChange={set("roleId")}
          >
            {roles.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-password" className={labelClass}>
            New password (optional)
          </label>
          <input
            id="edit-password"
            className={inputClass}
            type="password"
            minLength={8}
            autoComplete="new-password"
            placeholder="Leave blank to keep current"
            value={form.password}
            onChange={set("password")}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChangePasswordCard() {
  const dispatch = useDispatch();
  const [f, setF] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (f.newPassword !== f.confirm) return setMsg("Passwords do not match");

    setSaving(true);
    const res = await dispatch(
      changePassword({
        currentPassword: f.currentPassword,
        newPassword: f.newPassword,
      }),
    );
    setSaving(false);

    if (!res.error) {
      setMsg("Password changed successfully");
      setF({ currentPassword: "", newPassword: "", confirm: "" });
    }
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <section className={cardClass}>
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
        <SectionHeading
          eyebrow="Account"
          title="Change my password"
          description="Use at least 8 characters. You will stay signed in."
        />
      </div>

      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="cp-current" className={labelClass}>
              Current password
            </label>
            <input
              id="cp-current"
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={f.currentPassword}
              onChange={set("currentPassword")}
              required
            />
          </div>

          <div>
            <label htmlFor="cp-new" className={labelClass}>
              New password
            </label>
            <input
              id="cp-new"
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={f.newPassword}
              onChange={set("newPassword")}
              required
            />
          </div>

          <div>
            <label htmlFor="cp-confirm" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="cp-confirm"
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={f.confirm}
              onChange={set("confirm")}
              required
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{msg}</p>
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? "Updating..." : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function UserManager() {
  const dispatch = useDispatch();

  const { user: me } = useSelector((s) => s.auth);
  const { list = [], roles = [], error } = useSelector((s) => s.users);

  const canEdit = can(me, "user", "edit");

  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    email: "",
    password: "",
    roleId: "",
    username: "",
    name: "",
    phone: "",
  });

  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchRoles());
  }, [dispatch]);

  useEffect(() => {
    if (roles.length && !form.roleId) {
      const defaultRole =
        roles.find((role) => role.name === "User") || roles[0];

      setForm((current) => ({
        ...current,
        roleId: defaultRole._id,
      }));
    }
  }, [roles, form.roleId]);

  const filteredUsers = list.filter((user) => {
    const query = search.trim().toLowerCase();

    if (!query) return true;

    return [
      user.email,
      user.username,
      user.name,
      user.phone,
      user.role?.name,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(query),
    );
  });

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    try {
      const result = await dispatch(addUser(form));

      if (!result.error) {
        setForm((current) => ({
          ...current,
          email: "",
          password: "",
          username: "",
          name: "",
          phone: "",
        }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const togglePerm = (role, resource, action) => {
    const permissions = JSON.parse(JSON.stringify(role.permissions || {}));

    permissions[resource] = {
      view: false,
      edit: false,
      ...(permissions[resource] || {}),
    };

    permissions[resource][action] = !permissions[resource][action];

    // Editing a resource also requires viewing it.
    if (action === "edit" && permissions[resource].edit) {
      permissions[resource].view = true;
    }

    // Viewing cannot be disabled while editing is enabled.
    if (action === "view" && !permissions[resource].view) {
      permissions[resource].edit = false;
    }

    dispatch(
      saveRolePermissions({
        id: role._id,
        permissions,
      }),
    );
  };

  const handleDelete = (user) => {
    if (user._id === (me?.id || me?._id)) return;

    if (window.confirm(`Are you sure you want to delete ${user.email}?`)) {
      dispatch(removeUser(user._id));
    }
  };

  const adminCount = list.filter((user) => user.role?.name === "Admin").length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 text-slate-900 dark:text-slate-100">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Dashboard</span>
            <span>/</span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              User Management
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            User Management
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Manage team members, assign roles, and control access to prospects,
            companies, and user administration.
          </p>
        </div>

        <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="10" cy="7" r="4" />
              <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total team members
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {list.length}
            </p>
          </div>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Total users
            </p>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <circle cx="9" cy="8" r="4" />
                <path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M22 11h-6" />
              </svg>
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">
            {list.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Registered team members
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Admin accounts
            </p>
            <span className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <path d="m12 3 8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">
            {adminCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Users with the Admin role
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Available roles
            </p>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">
            {roles.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configured access roles
          </p>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
          <div className="flex gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="mt-0.5 h-5 w-5 shrink-0"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => dispatch(clearError())}
            className="rounded-md px-2 py-1 font-semibold hover:bg-red-100 dark:hover:bg-red-900/50"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Add user */}
      {canEdit && (
        <section className={cardClass}>
          <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
            <SectionHeading
              eyebrow="Team administration"
              title="Add a new user"
              description="Create an account and assign its initial access role."
            />
          </div>

          <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="new-email" className={labelClass}>
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-email"
                  className={inputClass}
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="new-password" className={labelClass}>
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-password"
                  className={inputClass}
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  minLength={8}
                  required
                />
              </div>

              <div>
                <label htmlFor="new-role" className={labelClass}>
                  Assign role <span className="text-red-500">*</span>
                </label>
                <select
                  id="new-role"
                  className={selectClass}
                  value={form.roleId}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                  required
                >
                  {roles.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-username" className={labelClass}>
                  Username
                </label>
                <input
                  id="new-username"
                  className={inputClass}
                  placeholder="johndoe"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="new-name" className={labelClass}>
                  Full name
                </label>
                <input
                  id="new-name"
                  className={inputClass}
                  placeholder="John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="new-phone" className={labelClass}>
                  Phone number
                </label>
                <input
                  id="new-phone"
                  className={inputClass}
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Fields marked with * are required.
              </p>
              <button
                type="submit"
                disabled={submitting || !roles.length}
                className={buttonClass}
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Creating user...
                  </>
                ) : (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-4 w-4"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add user
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Users table */}
      <section className={cardClass}>
        <div className="border-b border-slate-100 p-5 dark:border-slate-800 sm:px-6">
          <SectionHeading
            eyebrow="Directory"
            title="Team members"
            description="View team details and manage assigned roles."
            count={filteredUsers.length}
          />

          <div className="relative mt-5 max-w-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              aria-label="Search users"
              className={`${inputClass} pl-9`}
              placeholder="Search name, email, phone, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-5 py-4 font-semibold">Username</th>
                <th className="px-5 py-4 font-semibold">Phone</th>
                <th className="px-5 py-4 font-semibold">Role</th>
                {canEdit && (
                  <th className="px-6 py-4 text-right font-semibold">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((user) => {
                const isMe = user._id === (me?.id || me?._id);

                return (
                  <tr
                    key={user._id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold uppercase text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
                          {(user.name || user.username || user.email || "?")
                            .trim()
                            .charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {user.name || "—"}
                            {isMe && (
                              <span className="ml-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                You
                              </span>
                            )}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {user.username || "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {user.phone || "—"}
                    </td>

                    <td className="px-5 py-4">
                      {canEdit ? (
                        <select
                          aria-label={`Role for ${user.email}`}
                          className="max-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-500/20"
                          value={user.role?._id || ""}
                          onChange={(e) =>
                            dispatch(
                              changeUserRole({
                                id: user._id,
                                roleId: e.target.value,
                              }),
                            )
                          }
                        >
                          {!user.role?._id && <option value="">No role</option>}
                          {roles.map((role) => (
                            <option key={role._id} value={role._id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            user.role?.name === "Admin"
                              ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {user.role?.name || "Unassigned"}
                        </span>
                      )}
                    </td>

                    {canEdit && (
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(user)}
                          className="mr-1 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/60"
                        >
                          Edit
                        </button>
                        {isMe ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            Current account
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDelete(user)}
                            className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={canEdit ? 5 : 4}
                    className="px-6 py-14 text-center"
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-6 w-6"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m16 16 4 4" />
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                      No users found
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Try a different search term.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filteredUsers.length} of {list.length} users
          </p>
        </div>
      </section>

      {/* Role permissions */}
      <section className={cardClass}>
        <div className="border-b border-slate-100 p-5 dark:border-slate-800 sm:px-6">
          <SectionHeading
            eyebrow="Access control"
            title="Role permissions"
            description="Control which resources each role can view or edit."
            count={roles.length}
          />
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/40 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
              View access
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Edit access
            </span>
            <span>Edit access also enables view access.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead>
              <tr className="bg-white text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <th
                  rowSpan={2}
                  className="min-w-40 border-b border-r border-slate-100 px-6 py-4 font-semibold dark:border-slate-800"
                >
                  Role
                </th>

                {RESOURCES.map((resource) => (
                  <th
                    key={resource}
                    colSpan={2}
                    className="border-b border-r border-slate-100 px-4 py-4 text-center font-semibold capitalize last:border-r-0 dark:border-slate-800"
                  >
                    {resource}
                  </th>
                ))}
              </tr>

              <tr className="bg-slate-50/70 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
                {RESOURCES.flatMap((resource) => [
                  <th
                    key={`${resource}-view`}
                    className="border-b border-r border-slate-100 px-4 py-3 text-center font-medium dark:border-slate-800"
                  >
                    View
                  </th>,
                  <th
                    key={`${resource}-edit`}
                    className="border-b border-r border-slate-100 px-4 py-3 text-center font-medium dark:border-slate-800"
                  >
                    Edit
                  </th>,
                ])}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {roles.map((role) => {
                const isAdmin = role.name === "Admin";

                return (
                  <tr
                    key={role._id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                  >
                    <td className="border-r border-slate-100 px-6 py-4 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {role.name}
                        </span>
                        {isAdmin && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                            Protected
                          </span>
                        )}
                      </div>
                    </td>

                    {RESOURCES.flatMap((resource) =>
                      ["view", "edit"].map((action) => {
                        const checked =
                          !!role.permissions?.[resource]?.[action];

                        return (
                          <td
                            key={`${resource}-${action}`}
                            className="border-r border-slate-100 px-4 py-4 text-center last:border-r-0 dark:border-slate-800"
                          >
                            <label className="inline-flex cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                aria-label={`${role.name} ${resource} ${action}`}
                                checked={checked}
                                disabled={!canEdit || isAdmin}
                                onChange={() =>
                                  togglePerm(role, resource, action)
                                }
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                              />
                            </label>
                          </td>
                        );
                      }),
                    )}
                  </tr>
                );
              })}

              {roles.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No roles available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!canEdit && (
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 dark:border-amber-900/50 dark:bg-amber-950/40 sm:px-6">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              You have read-only access to user management and role permissions.
            </p>
          </div>
        )}
      </section>

      {/* Change my password (available to every role) */}
      <ChangePasswordCard />

      {/* Edit user modal */}
      {editing && (
        <EditUserModal
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
