import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "../i18n/I18nContext";
import {
  api,
  applyTheme,
  type Profile,
  type ThemeMode,
} from "../lib/api";
import { checkAndInstallUpdate } from "../lib/updater";

type SettingsModalProps = {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onProfileChange: (profile: Profile) => void;
  onToast: (message: string) => void;
};

export function SettingsModal({
  open,
  profile,
  onClose,
  onProfileChange,
  onToast,
}: SettingsModalProps) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [autoLockMinutes, setAutoLockMinutes] = useState(10);
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState(25);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTheme(profile.theme === "light" ? "light" : "dark");
    setAutoLockMinutes(profile.autoLockMinutes ?? 10);
    setClipboardClearSeconds(profile.clipboardClearSeconds ?? 25);
    setError(null);
  }, [open, profile]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateSettings({
        theme,
        autoLockMinutes,
        clipboardClearSeconds,
      });
      applyTheme(next.theme);
      onProfileChange(next);
      onToast(t("settingsSaved"));
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckUpdate() {
    setChecking(true);
    setError(null);
    onToast(t("checkingUpdates"));
    const result = await checkAndInstallUpdate();
    setChecking(false);
    if (result.status === "upToDate") {
      onToast(t("updateUpToDate"));
    } else if (result.status === "updated") {
      onToast(t("updateInstalling"));
    } else {
      onToast(t("updateUnavailable", { error: result.message }));
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal modal-compact settings-modal"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{t("settingsTitle")}</h2>
              <button className="btn ghost" type="button" onClick={onClose}>
                {t("close")}
              </button>
            </div>

            <form className="modal-form modal-form-compact" onSubmit={handleSave}>
              <div className="field">
                <span>{t("theme")}</span>
                <div className="status-row status-row-compact" role="group" aria-label={t("theme")}>
                  <button
                    type="button"
                    className={`status-chip theme-chip${theme === "light" ? " selected" : ""}`}
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none">
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {t("themeLight")}
                  </button>
                  <button
                    type="button"
                    className={`status-chip theme-chip${theme === "dark" ? " selected" : ""}`}
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none">
                      <path
                        d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {t("themeDark")}
                  </button>
                </div>
              </div>

              <label className="field">
                <span>{t("autoLockMinutes")}</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={autoLockMinutes}
                  onChange={(e) =>
                    setAutoLockMinutes(Number(e.target.value) || 1)
                  }
                />
              </label>

              <label className="field">
                <span>{t("clipboardClearSeconds")}</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={clipboardClearSeconds}
                  onChange={(e) =>
                    setClipboardClearSeconds(Number(e.target.value) || 5)
                  }
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}

              <div className="modal-actions settings-actions">
                <button
                  className="btn ghost"
                  type="button"
                  disabled={checking || saving}
                  onClick={() => void handleCheckUpdate()}
                >
                  {checking ? t("checkingUpdates") : t("checkUpdates")}
                </button>
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
