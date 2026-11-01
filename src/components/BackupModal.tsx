import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiscordIcon } from "./DiscordIcon";
import { useI18n } from "../i18n/I18nContext";
import { api, type AppConfig, type CloudBackupItem } from "../lib/api";

type BackupModalProps = {
  open: boolean;
  mode: "full" | "restore";
  canExport: boolean;
  onClose: () => void;
  onRestored: () => void;
  onToast?: (message: string) => void;
};

type Provider = "google" | "onedrive";

export function BackupModal({
  open,
  mode,
  canExport,
  onClose,
  onRestored,
  onToast,
}: BackupModalProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("google");
  const [items, setItems] = useState<CloudBackupItem[]>([]);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setItems([]);
    api.getAppConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [open]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleExportLocal() {
    await run(async () => {
      const path = await api.exportBackupLocal();
      onToast?.(t("backupSaved", { path }));
    });
  }

  async function handleImportLocal() {
    await run(async () => {
      await api.importBackupLocal();
      onToast?.(t("backupImported"));
      onRestored();
      onClose();
    });
  }

  async function handleCloudBackup() {
    await run(async () => {
      const name = await api.cloudBackup(provider);
      onToast?.(t("uploaded", { name }));
    });
  }

  async function handleDiscordBackup() {
    await run(async () => {
      const name = await api.sendBackupDiscord();
      onToast?.(t("backupSentDiscord", { name }));
    });
  }

  async function handleList() {
    await run(async () => {
      const list = await api.cloudListBackups(provider);
      setItems(list);
      if (list.length === 0) onToast?.(t("noCloudBackups"));
    });
  }

  async function handleRestore(id: string) {
    setPendingRestoreId(id);
  }

  async function confirmRestore() {
    if (!pendingRestoreId) return;
    const id = pendingRestoreId;
    setPendingRestoreId(null);
    await run(async () => {
      await api.cloudRestoreBackup(provider, id);
      onToast?.(t("backupRestored"));
      onRestored();
      onClose();
    });
  }

  const googleOk = !!config?.googleConfigured;
  const msOk = !!config?.microsoftConfigured;
  const providerLabel = provider === "google" ? t("googleDrive") : t("oneDrive");

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
            className="modal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{mode === "restore" ? t("restoreBackupTitle") : t("backupCloudTitle")}</h2>
              <button className="btn ghost" type="button" onClick={onClose}>
                {t("close")}
              </button>
            </div>

            <div className="modal-form">
              <p className="recover-help">{t("backupEncryptedHelp")}</p>

              {mode === "full" && canExport ? (
                <>
                  <button
                    className="btn secondary wide"
                    type="button"
                    disabled={busy}
                    onClick={handleExportLocal}
                  >
                    {t("exportFile")}
                  </button>
                  <button
                    className="btn secondary wide"
                    type="button"
                    disabled={busy}
                    onClick={handleCloudBackup}
                  >
                    {t("uploadBackupTo", { provider: providerLabel })}
                  </button>
                  <button
                    className="btn secondary wide btn-discord"
                    type="button"
                    disabled={busy}
                    onClick={handleDiscordBackup}
                  >
                    <DiscordIcon size={16} />
                    {t("sendBackupDiscord")}
                  </button>
                </>
              ) : null}

              <button
                className="btn secondary wide"
                type="button"
                disabled={busy}
                onClick={handleImportLocal}
              >
                {t("importFile")}
              </button>

              <div className="field">
                <span>{t("cloud")}</span>
                <div className="status-row">
                  <button
                    type="button"
                    className={`status-chip status-active${provider === "google" ? " selected" : ""}`}
                    disabled={!googleOk}
                    onClick={() => setProvider("google")}
                  >
                    {t("googleDrive")}
                    {googleOk ? "" : ` ${t("notConfigured")}`}
                  </button>
                  <button
                    type="button"
                    className={`status-chip status-active${provider === "onedrive" ? " selected" : ""}`}
                    disabled={!msOk}
                    onClick={() => setProvider("onedrive")}
                  >
                    {t("oneDrive")}
                    {msOk ? "" : ` ${t("notConfigured")}`}
                  </button>
                </div>
              </div>

              <button
                className="btn primary wide"
                type="button"
                disabled={busy || (provider === "google" ? !googleOk : !msOk)}
                onClick={handleList}
              >
                {t("searchCloudBackups")}
              </button>

              {items.length > 0 ? (
                <div className="backup-list">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="backup-item"
                      disabled={busy}
                      onClick={() => handleRestore(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.modifiedAt || "—"}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <p className="form-error">{error}</p> : null}
              {busy ? <p className="recover-help">{t("workingOAuth")}</p> : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
      )}
      <ConfirmDialog
        open={Boolean(pendingRestoreId)}
        title={t("restoreBackupTitle")}
        body={t("replaceVaultConfirm")}
        confirmLabel={t("restore")}
        cancelLabel={t("cancel")}
        danger
        busy={busy}
        onCancel={() => setPendingRestoreId(null)}
        onConfirm={() => void confirmRestore()}
      />
    </>
  );
}
