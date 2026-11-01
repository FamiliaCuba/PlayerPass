import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "./api";

let cachedInvite: string | null = null;

export async function getDiscordInvite(): Promise<string> {
  if (cachedInvite) return cachedInvite;
  try {
    const cfg = await api.getAppConfig();
    cachedInvite = (cfg.discordInviteUrl || "").trim();
  } catch {
    cachedInvite = "";
  }
  return cachedInvite;
}

export async function openDiscord(): Promise<void> {
  const url = await getDiscordInvite();
  if (!url) {
    throw new Error("Falta configurar el enlace de Discord");
  }
  await openUrl(url);
}
