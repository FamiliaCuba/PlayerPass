import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AccountModal } from "./components/AccountModal";
import { AmbientLock } from "./components/AmbientLock";
import { AppFooter } from "./components/AppFooter";
import { AuthScreen } from "./components/AuthScreen";
import { BackupModal } from "./components/BackupModal";
import { SettingsModal } from "./components/SettingsModal";
import { TitleBar } from "./components/TitleBar";
import { Toast, type ToastTone } from "./components/Toast";
import { VaultScreen } from "./components/VaultScreen";
import { I18nProvider, useI18n } from "./i18n/I18nContext";
import { detectLocale, type Locale } from "./i18n/locales";
import {
  api,
  applyTheme,
  sortAccounts,
  type Account,
  type AccountInput,
  type Profile,
} from "./lib/api";
import { checkAndInstallUpdate } from "./lib/updater";
import "./App.css";

type Phase = "loading" | "setup" | "unlock" | "vault";

const DEFAULT_PROFILE: Profile = {
  displayName: "",
  theme: "dark",
  autoLockMinutes: 10,
  clipboardClearSeconds: 25,
};

function AppShell() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("loading");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<ToastTone>("default");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMode, setBackupMode] = useState<"full" | "restore">("full");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());
  const phaseRef = useRef(phase);
  const lockMinutesRef = useRef(profile.autoLockMinutes ?? 10);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    lockMinutesRef.current = profile.autoLockMinutes ?? 10;
  }, [profile.autoLockMinutes]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [exists, loaded] = await Promise.all([
          api.vaultExists(),
          api.getProfile().catch(() => DEFAULT_PROFILE),
        ]);
        if (!alive) return;
        const next = { ...DEFAULT_PROFILE, ...loaded };
        setProfile(next);
        applyTheme(next.theme);
        setPhase(exists ? "unlock" : "setup");
      } catch {
        if (!alive) return;
        setPhase("setup");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Auto-update silencioso al arrancar (falla sin pubkey/repo real; se ignora).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAndInstallUpdate();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "default") => {
    setToastTone(tone);
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    const ms = tone === "danger" || tone === "success" ? 3200 : 1800;
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const handleLock = useCallback(async () => {
    await api.lockVault();
    setAccounts([]);
    setPhase("unlock");
    setAuthError(null);
    setModalOpen(false);
    setSettingsOpen(false);
  }, []);

  // Autolock por inactividad
  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "click"];
    for (const ev of events) {
      window.addEventListener(ev, bump, { passive: true });
    }
    const id = window.setInterval(() => {
      if (phaseRef.current !== "vault") return;
      const mins = Math.max(1, lockMinutesRef.current || 10);
      if (Date.now() - lastActivity.current >= mins * 60_000) {
        lastActivity.current = Date.now();
        void handleLock();
      }
    }, 15_000);
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump);
      }
      window.clearInterval(id);
    };
  }, [handleLock]);

  async function handleAuth(
    password: string,
    confirm?: string,
    name?: string,
  ) {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (phase === "setup") {
        const trimmed = (name || "").trim();
        if (!trimmed) {
          setAuthError(t("writeName"));
          return;
        }
        if (password !== confirm) {
          setAuthError(t("passwordsMismatch"));
          return;
        }
        if (password.length < 8) {
          setAuthError(t("minChars"));
          return;
        }
        const list = await api.createVault(password, trimmed);
        setProfile((p) => ({ ...p, displayName: trimmed }));
        setAccounts(sortAccounts(list));
        lastActivity.current = Date.now();
        setPhase("vault");
      } else {
        const list = await api.unlockVault(password);
        setAccounts(sortAccounts(list));
        lastActivity.current = Date.now();
        setPhase("vault");
      }
    } catch (err) {
      setAuthError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRecovered() {
    try {
      const list = await api.listAccounts();
      setAccounts(sortAccounts(list));
      lastActivity.current = Date.now();
      setPhase("vault");
      showToast(t("vaultRecovered"));
    } catch (err) {
      setAuthError(typeof err === "string" ? err : String(err));
      setPhase("unlock");
    }
  }

  async function handleCopy(text: string, label: string) {
    try {
      await api.copyToClipboard(text);
      showToast(label);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave(input: AccountInput, id?: string) {
    if (id) {
      const updated = await api.updateAccount(id, input);
      setAccounts((prev) =>
        sortAccounts(prev.map((a) => (a.id === id ? updated : a))),
      );
      showToast(t("accountUpdated"));
    } else {
      const created = await api.addAccount(input);
      setAccounts((prev) => sortAccounts([...prev, created]));
      showToast(t("accountAdded"));
    }
  }

  async function handleDelete(id: string) {
    const trashed = await api.deleteAccount(id);
    setAccounts((prev) => prev.map((a) => (a.id === id ? trashed : a)));
    showToast(t("accountDeleted"), "danger");
  }

  async function handleRestore(id: string) {
    const restored = await api.restoreAccount(id);
    setAccounts((prev) => sortAccounts(prev.map((a) => (a.id === id ? restored : a))));
    showToast(t("accountRestored"), "success");
  }

  async function handlePurge(id: string) {
    await api.purgeAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    showToast(t("accountPurged"), "danger");
  }

  async function handleEmptyTrash() {
    const removed = await api.emptyTrash();
    if (removed === 0) {
      showToast(t("trashAlreadyEmpty"));
      return;
    }
    setAccounts((prev) => prev.filter((a) => !a.deletedAt));
    showToast(t("trashEmptied", { n: removed }), "danger");
  }

  async function handleToggleFavorite(account: Account) {
    const next = !(account.favorite ?? false);
    const updated = await api.setFavorite(account.id, next);
    setAccounts((prev) =>
      sortAccounts(prev.map((a) => (a.id === account.id ? updated : a))),
    );
  }

  const displayName = profile.displayName || "";

  return (
    <div className="app">
      <TitleBar />
      <AmbientLock />
      <div className="app-body">
        <AnimatePresence mode="wait">
          {phase === "loading" ? (
            <div key="loading" className="boot">
              {t("loading")}
            </div>
          ) : phase === "setup" || phase === "unlock" ? (
            <AuthScreen
              key={phase}
              mode={phase}
              displayName={displayName}
              loading={authLoading}
              error={authError}
              onSubmit={handleAuth}
              onRecovered={handleRecovered}
              onRestoreBackup={() => {
                setBackupMode("restore");
                setBackupOpen(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <VaultScreen
              key="vault"
              accounts={accounts}
              onLock={handleLock}
              onNew={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              onEdit={(account) => {
                setEditing(account);
                setModalOpen(true);
              }}
              onCopy={handleCopy}
              onRestore={handleRestore}
              onPurge={handlePurge}
              onEmptyTrash={handleEmptyTrash}
              onToggleFavorite={handleToggleFavorite}
              onBackup={() => {
                setBackupMode("full");
                setBackupOpen(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onToast={showToast}
            />
          )}
        </AnimatePresence>

        <AccountModal
          open={modalOpen}
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
          onToggleFavorite={
            editing
              ? async () => {
                  const next = !(editing.favorite ?? false);
                  const updated = await api.setFavorite(editing.id, next);
                  setAccounts((prev) =>
                    sortAccounts(
                      prev.map((a) => (a.id === updated.id ? updated : a)),
                    ),
                  );
                  setEditing(updated);
                }
              : undefined
          }
        />

        <BackupModal
          open={backupOpen}
          mode={backupMode}
          canExport={phase === "vault"}
          onClose={() => setBackupOpen(false)}
          onRestored={async () => {
            const loaded = await api.getProfile().catch(() => DEFAULT_PROFILE);
            const next = { ...DEFAULT_PROFILE, ...loaded };
            setProfile(next);
            applyTheme(next.theme);
            setAccounts([]);
            setPhase("unlock");
            setAuthError(null);
          }}
          onToast={showToast}
        />

        <SettingsModal
          open={settingsOpen}
          profile={profile}
          onClose={() => setSettingsOpen(false)}
          onProfileChange={setProfile}
          onToast={showToast}
        />

        <Toast message={toast} tone={toastTone} />
        <AppFooter />
      </div>
    </div>
  );
}

function App() {
  const [bootLocale, setBootLocale] = useState<Locale | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.getProfile();
        applyTheme(profile.theme);
        if (profile.locale === "en" || profile.locale === "es") {
          setBootLocale(profile.locale);
          return;
        }
      } catch {
        // ignore
      }
      setBootLocale(detectLocale());
    })();
  }, []);

  if (!bootLocale) {
    return <div className="boot">PlayerPass…</div>;
  }

  return (
    <I18nProvider
      initialLocale={bootLocale}
      onLocaleChange={(locale) => {
        void api.setLocale(locale);
      }}
    >
      <AppShell />
    </I18nProvider>
  );
}

export default App;
