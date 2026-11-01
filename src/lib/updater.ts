import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateCheckResult =
  | { status: "upToDate" }
  | { status: "updated"; version: string }
  | { status: "unavailable"; message: string };

/** Comprueba, descarga e instala si hay update; relanza la app. */
export async function checkAndInstallUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (!update) {
      return { status: "upToDate" };
    }
    await update.downloadAndInstall();
    await relaunch();
    return { status: "updated", version: update.version };
  } catch (err) {
    const message =
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : String(err);
    return { status: "unavailable", message };
  }
}
