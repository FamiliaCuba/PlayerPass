import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmDialog } from "./ConfirmDialog";
import { useI18n } from "../i18n/I18nContext";
import type { Account, AccountInput, AccountStatus } from "../lib/api";
import { GAMES, PLATFORMS, isPresetGame } from "../lib/catalog";
import { PlatformIcon } from "./PlatformIcon";

type AccountModalProps = {
  open: boolean;
  initial?: Account | null;
  onClose: () => void;
  onSave: (input: AccountInput, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onToggleFavorite?: () => Promise<void>;
};

type FormState = {
  platform: string;
  gamePreset: string;
  customGame: string;
  username: string;
  password: string;
  hasMultiplayer: boolean;
  accountName: string;
  status: AccountStatus;
  shadowDays: 7 | 14;
  notes: string;
};

const empty: FormState = {
  platform: "steam",
  gamePreset: "COD/MW4/WZ",
  customGame: "",
  username: "",
  password: "",
  hasMultiplayer: false,
  accountName: "",
  status: "active",
  shadowDays: 7,
  notes: "",
};

function resolveGame(form: FormState): string {
  if (form.gamePreset === "Otros") return form.customGame.trim();
  return form.gamePreset;
}

export function AccountModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
  onToggleFavorite,
}: AccountModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const preset = isPresetGame(initial.game) ? initial.game : "Otros";
      setForm({
        platform: initial.platform || "other",
        gamePreset: preset,
        customGame: preset === "Otros" ? initial.game : "",
        username: initial.username,
        password: initial.password,
        hasMultiplayer: initial.hasMultiplayer ?? false,
        accountName: initial.accountName ?? "",
        status: (initial.status as AccountStatus) || "active",
        shadowDays: 7,
        notes: initial.notes ?? "",
      });
    } else {
      setForm(empty);
    }
    setError(null);
    setConfirmDelete(false);
  }, [open, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const game = resolveGame(form);
      if (!game) {
        setError(t("writeGameName"));
        return;
      }
      const input: AccountInput = {
        platform: form.platform,
        game,
        username: form.username,
        password: form.password,
        hasMultiplayer: form.hasMultiplayer,
        accountName: form.accountName,
        status: form.status,
        shadowDays: form.status === "shadow" ? form.shadowDays : null,
        notes: form.notes,
      };
      await onSave(input, initial?.id);
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!initial || !onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(initial.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const showMp =
    form.gamePreset === "COD/MW4/WZ" || form.gamePreset === "Battlefield";

  return (
    <>
      {createPortal(
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
                className="modal modal-compact"
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <h2>{initial ? t("editAccount") : t("newAccount")}</h2>
                  <div className="modal-head-actions">
                    {initial && onToggleFavorite ? (
                      <button
                        className={`btn ghost fav-toggle${initial.favorite ? " on" : ""}`}
                        type="button"
                        title={
                          initial.favorite
                            ? t("removeFavorite")
                            : t("addFavorite")
                        }
                        onClick={() => void onToggleFavorite()}
                      >
                        {initial.favorite ? "★" : "☆"} {t("favorite")}
                      </button>
                    ) : null}
                    <button className="btn ghost" type="button" onClick={onClose}>
                      {t("close")}
                    </button>
                  </div>
                </div>

                <form className="modal-form modal-form-compact" onSubmit={handleSubmit}>
                  <div className="field">
                    <span>{t("platform")}</span>
                    <div className="platform-grid">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          title={p.label}
                          aria-label={p.label}
                          className={`platform-chip${form.platform === p.id ? " active" : ""}`}
                          onClick={() => setForm({ ...form, platform: p.id })}
                        >
                          <PlatformIcon platform={p.id} size={18} />
                          <span>{p.shortLabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span>{t("game")}</span>
                      <select
                        value={form.gamePreset}
                        onChange={(e) =>
                          setForm({ ...form, gamePreset: e.target.value })
                        }
                        required
                      >
                        {GAMES.map((g) => (
                          <option key={g.id} value={g.label}>
                            {g.id === "other" ? t("gameOther") : g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{t("accountName")}</span>
                      <input
                        value={form.accountName}
                        onChange={(e) =>
                          setForm({ ...form, accountName: e.target.value })
                        }
                        placeholder={t("accountNamePlaceholder")}
                      />
                    </label>
                  </div>

                  {form.gamePreset === "Otros" ? (
                    <label className="field">
                      <span>{t("gameName")}</span>
                      <input
                        value={form.customGame}
                        onChange={(e) =>
                          setForm({ ...form, customGame: e.target.value })
                        }
                        placeholder={t("gameNamePlaceholder")}
                        required
                      />
                    </label>
                  ) : null}

                  {showMp ? (
                    <label className="check-row check-row-compact">
                      <input
                        type="checkbox"
                        checked={form.hasMultiplayer}
                        onChange={(e) =>
                          setForm({ ...form, hasMultiplayer: e.target.checked })
                        }
                      />
                      <span>{t("multiplayerOwned")}</span>
                    </label>
                  ) : null}

                  <div className="field">
                    <span>{t("status")}</span>
                    <div className="status-row status-row-compact">
                      {(
                        [
                          ["active", "statusActive"],
                          ["shadow", "statusShadow"],
                          ["banned", "statusBanned"],
                        ] as const
                      ).map(([value, key]) => (
                        <button
                          key={value}
                          type="button"
                          className={`status-chip status-${value}${form.status === value ? " selected" : ""}`}
                          onClick={() => setForm({ ...form, status: value })}
                        >
                          {t(key)}
                        </button>
                      ))}
                      {form.status === "shadow" ? (
                        <>
                          <button
                            type="button"
                            className={`status-chip status-shadow${form.shadowDays === 7 ? " selected" : ""}`}
                            onClick={() => setForm({ ...form, shadowDays: 7 })}
                          >
                            {t("days7")}
                          </button>
                          <button
                            type="button"
                            className={`status-chip status-shadow${form.shadowDays === 14 ? " selected" : ""}`}
                            onClick={() => setForm({ ...form, shadowDays: 14 })}
                          >
                            {t("days14")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span>{t("user")}</span>
                      <input
                        value={form.username}
                        onChange={(e) =>
                          setForm({ ...form, username: e.target.value })
                        }
                        required
                        autoFocus
                      />
                    </label>
                    <label className="field">
                      <span>{t("password")}</span>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        className="mono"
                        autoComplete="off"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>{t("notes")}</span>
                    <input
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder={t("notesPlaceholder")}
                    />
                  </label>

                  {error ? <p className="form-error">{error}</p> : null}

                  <div className="modal-actions">
                    {initial && onDelete ? (
                      <button
                        className="btn danger"
                        type="button"
                        disabled={saving}
                        onClick={() => setConfirmDelete(true)}
                      >
                        {t("delete")}
                      </button>
                    ) : (
                      <span />
                    )}
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
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("trashConfirmTitle")}
        body={t("trashConfirmBody", {
          name:
            (initial?.accountName || "").trim() ||
            initial?.username ||
            initial?.game ||
            "",
        })}
        confirmLabel={t("moveToTrash")}
        cancelLabel={t("cancel")}
        danger
        busy={saving}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  );
}
