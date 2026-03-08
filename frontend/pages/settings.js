import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AppShell from "../components/AppShell";
import { supabase } from "../lib/supabaseClient";

const AVATAR_BUCKET = "profile-images";

function getAvatarPathFromUrl(url) {
  const value = String(url || "").trim();
  if (!value) return null;

  const marker = `/${AVATAR_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index === -1) return null;

  return decodeURIComponent(value.slice(index + marker.length));
}

function getInitials(name) {
  return String(name || "User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPasswordStrength(password) {
  const value = String(password || "");
  let score = 0;

  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (value.length < 6) {
    return {
      label: "Too short",
      tone: "text-rose-300",
      meter: "bg-rose-500"
    };
  }

  if (score <= 1) {
    return {
      label: "Weak",
      tone: "text-rose-300",
      meter: "bg-rose-500"
    };
  }

  if (score <= 2) {
    return {
      label: "Medium",
      tone: "text-amber-300",
      meter: "bg-amber-400"
    };
  }

  return {
    label: "Strong",
    tone: "text-emerald-300",
    meter: "bg-emerald-400"
  };
}

const PASSWORD_FIELD_CONFIGS = [
  {
    key: "currentPassword",
    placeholder: "Current password"
  },
  {
    key: "nextPassword",
    placeholder: "New password"
  },
  {
    key: "confirmPassword",
    placeholder: "Confirm new password"
  }
];

function FeedbackBanner({ tone = "success", message }) {
  if (!message) return null;

  const styles =
    tone === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";

  return <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${styles}`}>{message}</div>;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState({
    name: "User",
    email: "user@example.com",
    avatarUrl: ""
  });
  const [theme, setTheme] = useState("dark");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [avatarSetupError, setAvatarSetupError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
    confirmPassword: ""
  });
  const [passwordVisibility, setPasswordVisibility] = useState({
    currentPassword: false,
    nextPassword: false,
    confirmPassword: false
  });

  const avatarActionsDisabled =
    loading || uploadingAvatar || removingAvatar || Boolean(avatarSetupError);
  const passwordStrength = getPasswordStrength(passwordForm.nextPassword);
  const confirmPasswordState =
    !passwordForm.confirmPassword
      ? null
      : passwordForm.confirmPassword === passwordForm.nextPassword
        ? {
            label: "Passwords match",
            tone: "text-emerald-300"
          }
        : {
            label: "Passwords do not match",
            tone: "text-rose-300"
          };
  const updatePasswordField = (key, value) => {
    setPasswordForm((prev) => ({ ...prev, [key]: value }));
  };
  const togglePasswordVisibility = (key) => {
    setPasswordVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const avatarHelpText = useMemo(() => {
    if (!avatarSetupError) {
      return `Avatar uploads use the Supabase storage bucket "${AVATAR_BUCKET}".`;
    }

    return `Avatar uploads need a public Supabase storage bucket named "${AVATAR_BUCKET}" with authenticated upload permissions.`;
  }, [avatarSetupError]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!active) return;

        if (user) {
          const nextAuthEmail = String(user.email || "").trim().toLowerCase();
          const nextPendingEmail = String(user.user_metadata?.pending_email || "")
            .trim()
            .toLowerCase();

          setAuthEmail(nextAuthEmail);
          setPendingEmail(nextPendingEmail && nextPendingEmail !== nextAuthEmail ? nextPendingEmail : "");
          setProfile({
            name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
            email: nextPendingEmail || user.email || "user@example.com",
            avatarUrl: user.user_metadata?.avatar_url || ""
          });
        }
      } catch {
        // keep fallback values
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const checkAvatarBucket = async () => {
      try {
        const { error } = await supabase.storage.from(AVATAR_BUCKET).list("", {
          limit: 1
        });

        if (!active) return;

        if (error && /bucket not found/i.test(error.message || "")) {
          setAvatarSetupError(
            `Avatar uploads are not configured yet. Create a public Supabase bucket named "${AVATAR_BUCKET}" and add the profile image storage policies from schema.sql.`
          );
          return;
        }

        setAvatarSetupError("");
      } catch {
        if (active) {
          setAvatarSetupError("");
        }
      }
    };

    if (typeof window !== "undefined") {
      setTheme(localStorage.getItem("app_theme") || "dark");
    }

    loadProfile();
    checkAvatarBucket();
    window.addEventListener("app-profile-change", loadProfile);

    return () => {
      active = false;
      window.removeEventListener("app-profile-change", loadProfile);
    };
  }, []);

  const handleThemeToggle = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("app_theme", nextTheme);
      window.dispatchEvent(new Event("app-theme-change"));
    }
    setProfileMessage(`Switched to ${nextTheme} mode.`);
    setProfileError("");
  };

  const refreshProfileViews = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("app-profile-change"));
    }
  };

  const saveProfile = async () => {
    const name = String(profile.name || "").trim();
    const nextEmail = String(profile.email || "").trim().toLowerCase();
    if (!name) {
      setProfileError("Profile name is required.");
      setProfileMessage("");
      return;
    }
    if (!nextEmail) {
      setProfileError("Profile email is required.");
      setProfileMessage("");
      return;
    }

    try {
      setSavingProfile(true);
      setProfileMessage("");
      setProfileError("");

      const {
        data: { user: currentUser }
      } = await supabase.auth.getUser();
      const currentEmail = String(currentUser?.email || authEmail || "")
        .trim()
        .toLowerCase();
      const emailChanged = Boolean(nextEmail && currentEmail && nextEmail !== currentEmail);
      const nextProfileData = {
        ...(currentUser?.user_metadata || {}),
        name,
        avatar_url: profile.avatarUrl || "",
        pending_email: emailChanged ? nextEmail : "",
        previous_email: emailChanged ? currentEmail : ""
      };

      const { error: updateError } = await supabase.auth.updateUser(
        emailChanged
          ? {
              email: nextEmail,
              data: nextProfileData
            }
          : {
              data: nextProfileData
            }
      );

      if (updateError) {
        throw new Error(updateError.message || "Could not save profile details.");
      }

      setProfile((prev) => ({
        ...prev,
        name,
        email: emailChanged ? nextEmail : prev.email
      }));
      setPendingEmail(emailChanged ? nextEmail : "");
      refreshProfileViews();
      setProfileMessage(
        emailChanged
          ? `Profile saved. Confirm the email change for ${nextEmail}, then sign in again with the new email.`
          : "Profile information saved."
      );
    } catch (err) {
      setProfileError(err?.message || "Could not save profile information.");
    } finally {
      setSavingProfile(false);
    }
  };

  const removeAvatar = async () => {
    const previousPath = getAvatarPathFromUrl(profile.avatarUrl);

    try {
      setRemovingAvatar(true);
      setProfileMessage("");
      setProfileError("");

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          name: String(profile.name || "").trim() || "User",
          avatar_url: ""
        }
      });

      if (updateError) {
        throw new Error(updateError.message || "Could not remove profile picture.");
      }

      if (previousPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => null);
      }

      setProfile((prev) => ({ ...prev, avatarUrl: "" }));
      refreshProfileViews();
      setProfileMessage("Profile picture removed.");
    } catch (err) {
      setProfileError(err?.message || "Could not remove profile picture.");
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previousPath = getAvatarPathFromUrl(profile.avatarUrl);

    try {
      setUploadingAvatar(true);
      setProfileMessage("");
      setProfileError("");

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("You need to sign in again before uploading a profile picture.");
      }

      if (avatarSetupError) {
        throw new Error(avatarSetupError);
      }

      const extension = String(file.name || "image").split(".").pop()?.toLowerCase() || "png";
      const safeName = `${Date.now()}.${extension}`;
      const path = `${user.id}/${safeName}`;
      const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        upsert: true
      });

      if (upload.error) {
        if (/bucket not found/i.test(upload.error.message || "")) {
          setAvatarSetupError(
            `Avatar uploads are not configured yet. Create a public Supabase bucket named "${AVATAR_BUCKET}" and add the profile image storage policies from schema.sql.`
          );
        }
        throw new Error(upload.error.message || "Avatar upload failed.");
      }

      const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const avatarUrl = publicData?.publicUrl || "";

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          name: String(profile.name || "").trim() || "User",
          avatar_url: avatarUrl
        }
      });

      if (updateError) {
        throw new Error(updateError.message || "Could not update profile picture.");
      }

      if (previousPath && previousPath !== path) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => null);
      }

      setProfile((prev) => ({ ...prev, avatarUrl }));
      refreshProfileViews();
      setProfileMessage("Profile picture updated.");
      setAvatarSetupError("");
    } catch (err) {
      setProfileError(
        err?.message ||
          `Could not upload profile picture. Configure the "${AVATAR_BUCKET}" bucket in Supabase.`
      );
    } finally {
      event.target.value = "";
      setUploadingAvatar(false);
    }
  };

  const changePassword = async () => {
    try {
      const currentPassword = String(passwordForm.currentPassword || "");
      const nextPassword = String(passwordForm.nextPassword || "");
      const confirmPassword = String(passwordForm.confirmPassword || "");

      setSecurityMessage("");
      setSecurityError("");

      if (!currentPassword) {
        throw new Error("Enter your current password.");
      }

      if (nextPassword.length < 6) {
        throw new Error("Use a password with at least 6 characters.");
      }

      if (nextPassword !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      setChangingPassword(true);

      const {
        data: { user: currentUser }
      } = await supabase.auth.getUser();
      const email = String(currentUser?.email || authEmail || "")
        .trim()
        .toLowerCase();

      if (!email) {
        throw new Error("Could not find the current account email.");
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (verifyError) {
        throw new Error(verifyError.message || "Current password is incorrect.");
      }

      const { error } = await supabase.auth.updateUser({
        password: nextPassword
      });
      if (error) {
        throw new Error(error.message || "Could not update the password.");
      }

      setPasswordForm({
        currentPassword: "",
        nextPassword: "",
        confirmPassword: ""
      });
      setSecurityMessage("Password updated successfully.");
    } catch (err) {
      setSecurityError(err?.message || "Could not update the password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const deleteAccount = async () => {
    try {
      setDeletingAccount(true);
      setSecurityMessage("");
      setSecurityError("");

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("You need to sign in again before deleting this account.");
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Could not delete this account. Check Supabase service-role configuration."
        );
      }

      await supabase.auth.signOut().catch(() => null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("app_session");
      }
      router.push("/login");
    } catch (err) {
      setSecurityError(err?.message || "Could not delete this account.");
    } finally {
      setDeletingAccount(false);
      setConfirmDelete(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Manage your workspace preferences">
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="text-lg font-semibold text-white">Profile</h3>
          <FeedbackBanner tone="success" message={profileMessage} />
          <FeedbackBanner tone="error" message={profileError} />
          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-800/80" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-800/80" />
              <div className="h-12 animate-pulse rounded-xl bg-slate-800/80" />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="h-16 w-16 rounded-full border border-slate-700 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-lg font-semibold text-slate-200">
                    {getInitials(profile.name)}
                  </div>
                )}
                <label
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    avatarActionsDisabled
                      ? "cursor-not-allowed border-slate-800 bg-slate-950/60 text-slate-500"
                      : "cursor-pointer border-slate-700 bg-slate-950 text-slate-200"
                  }`}
                >
                  {uploadingAvatar ? "Uploading..." : "Upload profile picture"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={avatarActionsDisabled}
                  />
                </label>
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={!profile.avatarUrl || loading || removingAvatar || uploadingAvatar}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removingAvatar ? "Removing..." : "Remove photo"}
                </button>
              </div>
              <p
                className={`text-xs ${
                  avatarSetupError ? "text-amber-300" : "text-slate-500"
                }`}
              >
                {avatarHelpText}
              </p>
              <input
                value={profile.name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, name: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
              />
              <input
                value={profile.email}
                type="email"
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, email: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
              />
              <p className={`text-xs ${pendingEmail ? "text-amber-300" : "text-slate-500"}`}>
                {pendingEmail
                  ? `Email change pending confirmation for ${pendingEmail}. Confirm it, then sign in again with the new email.`
                  : "Email changes require confirmation through Supabase Auth."}
              </p>
              <button
                type="button"
                onClick={saveProfile}
                disabled={loading || savingProfile}
                className="w-full rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingProfile ? "Saving profile..." : "Save profile"}
              </button>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="text-lg font-semibold text-white">Preferences</h3>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={handleThemeToggle}
                className="w-full rounded-xl bg-slate-950 px-3 py-2 text-left text-sm text-slate-200"
              >
                {theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="text-lg font-semibold text-white">Security</h3>
            <FeedbackBanner tone="success" message={securityMessage} />
            <FeedbackBanner tone="error" message={securityError} />
            <div className="mt-4 space-y-3">
              {PASSWORD_FIELD_CONFIGS.slice(0, 2).map((field) => (
                <PasswordField
                  key={field.key}
                  value={passwordForm[field.key]}
                  visible={passwordVisibility[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => updatePasswordField(field.key, event.target.value)}
                  onToggleVisibility={() => togglePasswordVisibility(field.key)}
                />
              ))}
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${passwordStrength.meter} ${
                      passwordForm.nextPassword.length < 6
                        ? "w-1/4"
                        : passwordStrength.label === "Weak"
                          ? "w-1/3"
                          : passwordStrength.label === "Medium"
                            ? "w-2/3"
                            : "w-full"
                    }`}
                  />
                </div>
                <p className={`text-xs ${passwordStrength.tone}`}>
                  Password strength: {passwordStrength.label}
                </p>
              </div>
              <PasswordField
                value={passwordForm.confirmPassword}
                visible={passwordVisibility.confirmPassword}
                placeholder="Confirm new password"
                onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
                onToggleVisibility={() => togglePasswordVisibility("confirmPassword")}
              />
              {confirmPasswordState ? (
                <p className={`text-xs ${confirmPasswordState.tone}`}>
                  {confirmPasswordState.label}
                </p>
              ) : null}
              <button
                type="button"
                onClick={changePassword}
                disabled={loading || changingPassword}
                className="w-full rounded-xl bg-slate-950 px-3 py-2 text-left text-sm text-slate-200 disabled:opacity-60"
              >
                {changingPassword ? "Updating password..." : "Change password"}
              </button>
              <p className="text-xs text-slate-500">
                Enter your current password, then choose a new one. No email confirmation is required.
              </p>
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-500"
              >
                Enable 2FA (coming soon)
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(true);
                    setSecurityMessage("");
                    setSecurityError("");
                  }}
                  className="w-full rounded-xl bg-rose-600/20 px-3 py-2 text-left text-sm text-rose-300"
                >
                  Delete account
                </button>
              ) : (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                  <p className="text-sm text-rose-100">
                    This permanently deletes your account, notes, tasks, AI history,
                    notifications, and activity logs.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={deleteAccount}
                      disabled={deletingAccount}
                      className="rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {deletingAccount ? "Deleting account..." : "Yes, delete everything"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deletingAccount}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function PasswordField({
  value,
  visible,
  placeholder,
  onChange,
  onToggleVisibility
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full bg-transparent text-sm text-slate-200 outline-none"
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
