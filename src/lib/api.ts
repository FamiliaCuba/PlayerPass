import { invoke } from "@tauri-apps/api/core";

export type AccountStatus = "active" | "shadow" | "banned";

export type Account = {
  id: string;
  platform: string;
  game: string;
  username: string;
  password: string;
  hasMultiplayer: boolean;
  accountName: string;
  status: AccountStatus | string;
  shadowUntil?: string | null;
  notes: string;
  tags: string[];
  updatedAt: string;
  deletedAt?: string | null;
  favorite?: boolean;
};

export type AccountInput = {
  platform: string;
  game: string;
  username: string;
  password: string;
  hasMultiplayer?: boolean;
  accountName?: string;
  status?: AccountStatus | string;
  shadowDays?: number | null;
  notes?: string;
};

export type AppConfig = {
  discordInviteUrl: string;
  googleConfigured?: boolean;
  microsoftConfigured?: boolean;
};

export type CloudBackupItem = {
  id: string;
  name: string;
  modifiedAt: string;
};

export type ThemeMode = "light" | "dark";

export type Profile = {
  displayName: string;
  locale?: string;
  theme?: ThemeMode | string;
  autoLockMinutes?: number;
  clipboardClearSeconds?: number;
};

export type SettingsInput = {
  theme?: ThemeMode;
  autoLockMinutes?: number;
  clipboardClearSeconds?: number;
};

export const api = {
  vaultExists: () => invoke<boolean>("vault_exists"),
  getProfile: () => invoke<Profile>("get_profile"),
  setLocale: (locale: string) => invoke<void>("set_locale", { locale }),
  updateSettings: (input: SettingsInput) =>
    invoke<Profile>("update_settings", { input }),
  createVault: (password: string, displayName: string) =>
    invoke<Account[]>("create_vault", { password, displayName }),
  unlockVault: (password: string) =>
    invoke<Account[]>("unlock_vault", { password }),
  lockVault: () => invoke<void>("lock_vault"),
  listAccounts: () => invoke<Account[]>("list_accounts"),
  addAccount: (input: AccountInput) =>
    invoke<Account>("add_account", { input }),
  updateAccount: (id: string, input: AccountInput) =>
    invoke<Account>("update_account", { id, input }),
  deleteAccount: (id: string) => invoke<Account>("delete_account", { id }),
  restoreAccount: (id: string) => invoke<Account>("restore_account", { id }),
  purgeAccount: (id: string) => invoke<void>("purge_account", { id }),
  emptyTrash: () => invoke<number>("empty_trash"),
  setFavorite: (id: string, favorite: boolean) =>
    invoke<Account>("set_favorite", { id, favorite }),
  copyToClipboard: (text: string) =>
    invoke<void>("copy_to_clipboard", { text }),
  getAppConfig: () => invoke<AppConfig>("get_app_config"),
  requestPasswordRecovery: (contact: string) =>
    invoke<void>("request_password_recovery", { contact }),
  resetMasterPassword: (recoveryCode: string, newPassword: string) =>
    invoke<Account[]>("reset_master_password", { recoveryCode, newPassword }),
  exportBackupLocal: () => invoke<string>("export_backup_local"),
  importBackupLocal: () => invoke<void>("import_backup_local"),
  cloudBackup: (provider: "google" | "onedrive") =>
    invoke<string>("cloud_backup", { provider }),
  sendBackupDiscord: () => invoke<string>("send_backup_discord"),
  cloudListBackups: (provider: "google" | "onedrive") =>
    invoke<CloudBackupItem[]>("cloud_list_backups", { provider }),
  cloudRestoreBackup: (provider: "google" | "onedrive", fileId: string) =>
    invoke<void>("cloud_restore_backup", { provider, fileId }),
};

export function sortAccounts(list: Account[]): Account[] {
  return [...list].sort((a, b) => {
    const fav = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (fav !== 0) return fav;
    const game = a.game.localeCompare(b.game);
    if (game !== 0) return game;
    return a.username.localeCompare(b.username);
  });
}

export function applyTheme(theme: ThemeMode | string | undefined) {
  const mode: ThemeMode = theme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("theme-light", mode === "light");
  document.documentElement.classList.toggle("theme-dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}
