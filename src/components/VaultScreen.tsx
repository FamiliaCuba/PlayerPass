import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ConfirmDialog } from "./ConfirmDialog";
import { LanguageSwitch, useI18n } from "../i18n/I18nContext";
import type { Account } from "../lib/api";
import { platformLabel, shadowRemainingLabel } from "../lib/catalog";
import { openDiscord } from "../lib/discord";
import { DiscordIcon } from "./DiscordIcon";
import { PlatformIcon } from "./PlatformIcon";

type VaultScreenProps = {
  accounts: Account[];
  onLock: () => void;
  onNew: () => void;
  onEdit: (account: Account) => void;
  onCopy: (text: string, label: string) => void;
  onRestore?: (id: string) => Promise<void>;
  onPurge?: (id: string) => Promise<void>;
  onEmptyTrash?: () => Promise<void>;
  onToggleFavorite?: (account: Account) => Promise<void>;
  onBackup?: () => void;
  onOpenSettings?: () => void;
  onToast?: (message: string) => void;
};

function isTrashed(account: Account) {
  return Boolean(account.deletedAt);
}

function isBanned(account: Account) {
  return (account.status || "active") === "banned";
}

function isShadow(account: Account) {
  return (account.status || "active") === "shadow";
}

function trashDaysLeft(deletedAt?: string | null): number {
  if (!deletedAt) return 0;
  const end = Date.parse(deletedAt) + 7 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

function matchesQuery(account: Account, q: string) {
  if (!q) return true;
  const hay = [
    account.game,
    account.username,
    account.accountName,
    account.platform,
    platformLabel(account.platform),
    account.notes,
    account.status,
    account.hasMultiplayer ? "multijugador multiplayer" : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function VaultScreen({
  accounts,
  onLock,
  onNew,
  onEdit,
  onCopy,
  onRestore,
  onPurge,
  onEmptyTrash,
  onToggleFavorite,
  onBackup,
  onOpenSettings,
  onToast,
}: VaultScreenProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<Account | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const activePool = useMemo(
    () => accounts.filter((a) => !isTrashed(a)),
    [accounts],
  );
  const trashAccounts = useMemo(
    () => accounts.filter((a) => isTrashed(a)),
    [accounts],
  );
  const liveAccounts = useMemo(
    () => activePool.filter((a) => !isBanned(a)),
    [activePool],
  );
  const bannedAccounts = useMemo(
    () => activePool.filter((a) => isBanned(a)),
    [activePool],
  );
  const shadowCount = useMemo(
    () => liveAccounts.filter((a) => isShadow(a)).length,
    [liveAccounts],
  );

  const filteredLive = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveAccounts.filter((a) => matchesQuery(a, q));
  }, [liveAccounts, query]);

  const filteredBanned = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bannedAccounts.filter((a) => matchesQuery(a, q));
  }, [bannedAccounts, query]);

  const filteredTrash = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trashAccounts.filter((a) => matchesQuery(a, q));
  }, [trashAccounts, query]);

  async function handleDiscord() {
    try {
      await openDiscord();
    } catch (err) {
      onToast?.(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRestore(id: string) {
    if (!onRestore) return;
    setBusy(true);
    try {
      await onRestore(id);
    } finally {
      setBusy(false);
    }
  }

  async function handlePurgeConfirm() {
    if (!purgeTarget || !onPurge) return;
    setBusy(true);
    try {
      await onPurge(purgeTarget.id);
      setPurgeTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmptyTrashConfirm() {
    if (!onEmptyTrash) return;
    setBusy(true);
    try {
      await onEmptyTrash();
      setEmptyTrashConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const accountsLabel =
    liveAccounts.length === 1
      ? t("vaultStatsAccounts", { n: liveAccounts.length })
      : t("vaultStatsAccountsPlural", { n: liveAccounts.length });
  const shadowLabel = t("vaultStatsShadow", { n: shadowCount });
  const bannedLabel =
    bannedAccounts.length === 1
      ? t("bannedHistoryCount", { n: bannedAccounts.length })
      : t("bannedHistoryCountPlural", { n: bannedAccounts.length });
  const trashLabel = t("trashCount", { n: trashAccounts.length });

  return (
    <motion.section
      className="vault-shell"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
    >
      <div className="vault-lang">
        <LanguageSwitch />
      </div>
      <header className="vault-top">
        <div className="vault-brand">
          <span className="brand-logo-wrap sm">
            <img src="/logo.svg" alt="" className="brand-logo sm" />
          </span>
          <div>
            <h1>PlayerPass</h1>
            <div
              className="vault-stats"
              aria-label={t("vaultStats", {
                accounts: accountsLabel,
                shadow: shadowCount,
              })}
            >
              <span className="vault-stat">{accountsLabel}</span>
              <span className="vault-stat-sep" aria-hidden>
                ·
              </span>
              <span className="vault-stat shadow">{shadowLabel}</span>
              {bannedAccounts.length > 0 ? (
                <>
                  <span className="vault-stat-sep" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    className="vault-stat banned linkish"
                    onClick={() => setHistoryOpen((v) => !v)}
                  >
                    {bannedLabel}
                  </button>
                </>
              ) : null}
              {trashAccounts.length > 0 ? (
                <>
                  <span className="vault-stat-sep" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    className="vault-stat trash linkish"
                    onClick={() => setTrashOpen((v) => !v)}
                  >
                    {trashLabel}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="vault-actions">
          <button className="btn ghost btn-discord" type="button" onClick={handleDiscord}>
            <DiscordIcon size={15} />
            {t("discord")}
          </button>
          {onBackup ? (
            <button className="btn ghost" type="button" onClick={onBackup}>
              {t("backup")}
            </button>
          ) : null}
          {onOpenSettings ? (
            <button className="btn ghost" type="button" onClick={onOpenSettings}>
              {t("settings")}
            </button>
          ) : null}
          <button className="btn ghost" type="button" onClick={onLock}>
            {t("lock")}
          </button>
          <button className="btn primary" type="button" onClick={onNew}>
            {t("newAccount")}
          </button>
        </div>
      </header>

      <div className="search-wrap">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
        />
      </div>

      {filteredLive.length === 0 ? (
        <div className="empty">
          <h2>
            {liveAccounts.length === 0 ? t("noAccountsYet") : t("noResults")}
          </h2>
          <p>
            {liveAccounts.length === 0 ? t("addGamesHint") : t("tryAnotherTerm")}
          </p>
          {liveAccounts.length === 0 ? (
            <button className="btn primary" type="button" onClick={onNew}>
              {t("addAccount")}
            </button>
          ) : null}
        </div>
      ) : (
        <AccountGrid
          accounts={filteredLive}
          onEdit={onEdit}
          onCopy={onCopy}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      <section className="banned-history">
        <button
          type="button"
          className="banned-history-toggle"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
        >
          <span>{t("bannedHistoryTitle")}</span>
          <span className="banned-history-count">{bannedLabel}</span>
          <span className="banned-history-chevron" aria-hidden>
            {historyOpen ? "▾" : "▸"}
          </span>
        </button>
        {historyOpen ? (
          <div className="banned-history-body">
            <p className="banned-history-hint">{t("bannedHistoryHint")}</p>
            {filteredBanned.length === 0 ? (
              <p className="banned-history-empty">
                {bannedAccounts.length === 0
                  ? t("bannedHistoryEmpty")
                  : t("noResults")}
              </p>
            ) : (
              <AccountGrid
                accounts={filteredBanned}
                onEdit={onEdit}
                onCopy={onCopy}
                onToggleFavorite={onToggleFavorite}
                muted
              />
            )}
          </div>
        ) : null}
      </section>

      <section className="banned-history trash-section">
        <button
          type="button"
          className="banned-history-toggle"
          onClick={() => setTrashOpen((v) => !v)}
          aria-expanded={trashOpen}
        >
          <span>{t("trashTitle")}</span>
          <span className="banned-history-count">{trashLabel}</span>
          <span className="banned-history-chevron" aria-hidden>
            {trashOpen ? "▾" : "▸"}
          </span>
        </button>
        {trashOpen ? (
          <div className="banned-history-body">
            <div className="trash-toolbar">
              <p className="banned-history-hint">{t("trashHint")}</p>
              {trashAccounts.length > 0 && onEmptyTrash ? (
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => setEmptyTrashConfirm(true)}
                >
                  {t("emptyTrash")}
                </button>
              ) : null}
            </div>
            {filteredTrash.length === 0 ? (
              <p className="banned-history-empty">
                {trashAccounts.length === 0 ? t("trashEmpty") : t("noResults")}
              </p>
            ) : (
              <div className="trash-list">
                {filteredTrash.map((account) => {
                  const title =
                    (account.accountName || "").trim() || account.username;
                  const days = trashDaysLeft(account.deletedAt);
                  return (
                    <article key={account.id} className="trash-item">
                      <div className="trash-item-main">
                        <strong>{title}</strong>
                        <span>
                          {account.game} · {t("daysLeft", { n: days })}
                        </span>
                      </div>
                      <div className="trash-item-actions">
                        {onRestore ? (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void handleRestore(account.id)}
                          >
                            {t("restore")}
                          </button>
                        ) : null}
                        {onPurge ? (
                          <button
                            type="button"
                            className="btn danger"
                            disabled={busy}
                            onClick={() => setPurgeTarget(account)}
                          >
                            {t("purgeForever")}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title={t("purgeConfirmTitle")}
        body={t("purgeConfirmBody", {
          name:
            (purgeTarget?.accountName || "").trim() ||
            purgeTarget?.username ||
            purgeTarget?.game ||
            "",
        })}
        confirmLabel={t("purgeForever")}
        cancelLabel={t("cancel")}
        danger
        busy={busy}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => void handlePurgeConfirm()}
      />

      <ConfirmDialog
        open={emptyTrashConfirm}
        title={t("emptyTrashConfirmTitle")}
        body={t("emptyTrashConfirmBody", { n: trashAccounts.length })}
        confirmLabel={t("emptyTrash")}
        cancelLabel={t("cancel")}
        danger
        busy={busy}
        onCancel={() => setEmptyTrashConfirm(false)}
        onConfirm={() => void handleEmptyTrashConfirm()}
      />
    </motion.section>
  );
}

function AccountGrid({
  accounts,
  onEdit,
  onCopy,
  onToggleFavorite,
  muted = false,
}: {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onCopy: (text: string, label: string) => void;
  onToggleFavorite?: (account: Account) => Promise<void>;
  muted?: boolean;
}) {
  const { t } = useI18n();

  return (
    <motion.div
      className={`account-grid${muted ? " muted" : ""}`}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04 } },
      }}
    >
      {accounts.map((account) => (
        <motion.article
          key={account.id}
          className={`account-card status-${account.status || "active"}${account.favorite ? " is-favorite" : ""}`}
          variants={{
            hidden: { opacity: 0, y: 12 },
            show: { opacity: 1, y: 0 },
          }}
          layout
        >
          <StatusCorner account={account} />
          {onToggleFavorite ? (
            <button
              type="button"
              className={`fav-btn${account.favorite ? " on" : ""}`}
              title={account.favorite ? t("removeFavorite") : t("addFavorite")}
              aria-label={account.favorite ? t("removeFavorite") : t("addFavorite")}
              onClick={(e) => {
                e.stopPropagation();
                void onToggleFavorite(account);
              }}
            >
              {account.favorite ? "★" : "☆"}
            </button>
          ) : account.favorite ? (
            <span className="fav-btn on static" aria-hidden>
              ★
            </span>
          ) : null}
          <button
            type="button"
            className="account-main"
            onClick={() => onEdit(account)}
          >
            <span className="account-meta">
              <span className="platform-badge">
                <PlatformIcon platform={account.platform} size={16} />
                {platformLabel(account.platform)}
              </span>
              {account.hasMultiplayer ? (
                <span className="mp-badge">MP</span>
              ) : null}
            </span>
            <span className="account-title">
              {(account.accountName || "").trim() || account.username}
            </span>
            <span className="game-name">{account.game}</span>
            {(account.accountName || "").trim() ? (
              <span className="username mono">{account.username}</span>
            ) : null}
          </button>
          <div className="copy-row">
            <button
              type="button"
              className="btn copy"
              onClick={() => onCopy(account.username, t("userCopied"))}
            >
              {t("user")}
            </button>
            <button
              type="button"
              className="btn copy"
              onClick={() => onCopy(account.password, t("passCopied"))}
            >
              {t("pass")}
            </button>
            <button
              type="button"
              className="btn copy"
              onClick={() =>
                onCopy(
                  `${account.username}:${account.password}`,
                  t("bothCopied"),
                )
              }
            >
              {t("both")}
            </button>
          </div>
        </motion.article>
      ))}
    </motion.div>
  );
}

function StatusCorner({ account }: { account: Account }) {
  const { t } = useI18n();
  const status = account.status || "active";
  if (status === "banned") {
    return <span className="status-corner banned">{t("statusBanned")}</span>;
  }
  if (status === "shadow") {
    return (
      <span className="status-corner shadow">
        {t("shadowTimer", { time: shadowRemainingLabel(account.shadowUntil) })}
      </span>
    );
  }
  return <span className="status-corner active">{t("statusActive")}</span>;
}
