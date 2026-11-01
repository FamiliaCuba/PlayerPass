export type PlatformId =
  | "steam"
  | "xbox"
  | "battlenet"
  | "ea"
  | "epic"
  | "ubisoft"
  | "riot"
  | "playstation"
  | "nintendo"
  | "other";

export type Platform = {
  id: PlatformId;
  label: string;
  shortLabel: string;
};

export type GameOption = {
  id: string;
  label: string;
  custom?: boolean;
};

export type AccountStatus = "active" | "shadow" | "banned";

export const PLATFORMS: Platform[] = [
  { id: "steam", label: "Steam", shortLabel: "Steam" },
  { id: "xbox", label: "Xbox", shortLabel: "Xbox" },
  { id: "battlenet", label: "Battle.net", shortLabel: "B.net" },
  { id: "ea", label: "EA App", shortLabel: "EA" },
  { id: "epic", label: "Epic", shortLabel: "Epic" },
  { id: "ubisoft", label: "Ubisoft", shortLabel: "Ubi" },
  { id: "riot", label: "Riot", shortLabel: "Riot" },
  { id: "playstation", label: "PlayStation", shortLabel: "PS" },
  { id: "nintendo", label: "Nintendo", shortLabel: "Switch" },
  { id: "other", label: "Otro", shortLabel: "Otro" },
];

export const GAMES: GameOption[] = [
  { id: "cod", label: "COD/MW4/WZ" },
  { id: "battlefield", label: "Battlefield" },
  { id: "arc-raiders", label: "ARC Raiders" },
  { id: "rust", label: "Rust" },
  { id: "valorant", label: "Valorant" },
  { id: "fortnite", label: "Fortnite" },
  { id: "cs", label: "CS2/GO" },
  { id: "other", label: "Otros", custom: true },
];

export function platformLabel(id: string): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

export function isPresetGame(label: string): boolean {
  return GAMES.some((g) => g.label === label && !g.custom);
}

export function shadowRemainingLabel(shadowUntil?: string | null): string {
  if (!shadowUntil) return "Shadow";
  const end = Date.parse(shadowUntil);
  if (Number.isNaN(end)) return "Shadow";
  const ms = end - Date.now();
  if (ms <= 0) return "Shadow fin";
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days > 1) return `${days}d`;
  const hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
  return `${hours}h`;
}
