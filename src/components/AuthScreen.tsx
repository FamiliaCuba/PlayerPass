import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { LanguageSwitch, useI18n } from "../i18n/I18nContext";
import { api } from "../lib/api";
import { openDiscord } from "../lib/discord";
import { DiscordIcon } from "./DiscordIcon";

type AuthScreenProps = {
  mode: "setup" | "unlock";
  displayName?: string;
  loading: boolean;
  error: string | null;
  onSubmit: (password: string, confirm?: string, displayName?: string) => Promise<void>;
  onRecovered: () => void;
  onRestoreBackup?: () => void;
  onOpenSettings?: () => void;
};

export function AuthScreen({
  mode,
  displayName = "",
  loading,
  error,
  onSubmit,
  onRecovered,
  onRestoreBackup,
  onOpenSettings,
}: AuthScreenProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [view, setView] = useState<"auth" | "recover">("auth");
  const [contact, setContact] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(password, confirm, name);
  }

  async function handleNotifyAdmin() {
    setBusy(true);
    setRecoverError(null);
    setRecoverMsg(null);
    try {
      await api.requestPasswordRecovery(contact);
      setRecoverMsg(t("recoverySent"));
    } catch (err) {
      setRecoverError(typeof err === "string" ? err : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDiscord() {
    setRecoverError(null);
    try {
      await openDiscord();
    } catch (err) {
      setRecoverError(typeof err === "string" ? err : String(err));
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRecoverError(null);
    setRecoverMsg(null);
    try {
      if (newPassword !== newConfirm) {
        setRecoverError(t("newPasswordsMismatch"));
        return;
      }
      if (newPassword.length < 8) {
        setRecoverError(t("minChars"));
        return;
      }
      await api.resetMasterPassword(
        recoveryCode.trim().replace(/[`'"\s]/g, ""),
        newPassword,
      );
      setRecoverMsg(t("passwordResetEntering"));
      onRecovered();
    } catch (err) {
      setRecoverError(typeof err === "string" ? err : String(err));
    } finally {
      setBusy(false);
    }
  }

  const greeting = displayName.trim()
    ? t("helloEnterPassword", { name: displayName.trim() })
    : t("enterMasterPassword");

  return (
    <motion.section
      className="auth-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="auth-chrome">
        <LanguageSwitch compact />
        {onOpenSettings ? (
          <button
            type="button"
            className="auth-chrome-link"
            onClick={onOpenSettings}
          >
            {t("settings")}
          </button>
        ) : null}
      </div>
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
      >
        <div className="brand-block">
          <span className="brand-logo-wrap">
            <img src="/logo.svg" alt="" className="brand-logo" />
          </span>
          <h1 className="brand-title">PlayerPass</h1>
          <p className="brand-sub">
            {view === "recover"
              ? t("recoverHelpTitle")
              : mode === "setup"
                ? t("setupHelp")
                : greeting}
          </p>
        </div>

        {view === "auth" ? (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "setup" ? (
              <label className="field">
                <span>{t("yourName")}</span>
                <input
                  type="text"
                  autoFocus
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </label>
            ) : null}

            <label className="field">
              <span>{t("masterPassword")}</span>
              <input
                type="password"
                autoFocus={mode !== "setup"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
            </label>

            {mode === "setup" ? (
              <label className="field">
                <span>{t("confirmPassword")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </label>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}

            <button className="btn primary wide" type="submit" disabled={loading}>
              {loading
                ? t("pleaseWait")
                : mode === "setup"
                  ? t("createVault")
                  : t("unlock")}
            </button>

            <button
              className="btn secondary wide btn-discord"
              type="button"
              onClick={handleOpenDiscord}
            >
              <DiscordIcon size={16} />
              {t("joinDiscord")}
            </button>

            {onRestoreBackup ? (
              <button
                className="btn secondary wide"
                type="button"
                onClick={onRestoreBackup}
              >
                {t("restoreBackup")}
              </button>
            ) : null}

            {mode === "unlock" ? (
              <button
                className="btn link wide"
                type="button"
                onClick={() => setView("recover")}
              >
                {t("forgotPassword")}
              </button>
            ) : null}
          </form>
        ) : (
          <div className="auth-form">
            <p className="recover-help">{t("recoverHelpBody")}</p>
            <button
              className="btn secondary wide btn-discord"
              type="button"
              onClick={handleOpenDiscord}
            >
              <DiscordIcon size={16} />
              {t("openDiscordTicket")}
            </button>

            <label className="field">
              <span>{t("discordContact")}</span>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="@usuario"
              />
            </label>
            <button
              className="btn secondary wide"
              type="button"
              disabled={busy}
              onClick={handleNotifyAdmin}
            >
              {t("notifyAdmin")}
            </button>

            <div className="divider" />

            <form className="auth-form" onSubmit={handleReset}>
              <label className="field">
                <span>{t("adminCode")}</span>
                <input
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="PP-XXXX-XXXX-XXXX"
                  required
                  className="mono"
                />
              </label>
              <label className="field">
                <span>{t("newMasterPassword")}</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{t("confirmNewPassword")}</span>
                <input
                  type="password"
                  value={newConfirm}
                  onChange={(e) => setNewConfirm(e.target.value)}
                  required
                />
              </label>

              {recoverError ? <p className="form-error">{recoverError}</p> : null}
              {recoverMsg ? <p className="form-ok">{recoverMsg}</p> : null}

              <button className="btn primary wide" type="submit" disabled={busy}>
                {t("resetPassword")}
              </button>
              <button
                className="btn link wide"
                type="button"
                onClick={() => setView("auth")}
              >
                {t("back")}
              </button>
            </form>
          </div>
        )}
      </motion.div>
    </motion.section>
  );
}
