import type { PlatformId } from "../lib/catalog";

type Props = {
  platform: string;
  size?: number;
  className?: string;
};

export function PlatformIcon({ platform, size = 22, className }: Props) {
  const id = (platform || "other") as PlatformId;
  return (
    <svg
      className={["platform-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      {iconPath(id)}
    </svg>
  );
}

function iconPath(id: PlatformId) {
  switch (id) {
    case "steam":
      return (
        <path
          fill="currentColor"
          d="M12 2a10 10 0 0 0-9.9 11.4l5.3 2.2a2.7 2.7 0 0 1 1.5-.4c.1 0 .3 0 .4.1l2.4-3.4v-.2a3.6 3.6 0 1 1 3.6 3.6h-.2l-3.4 2.4v.4a2.7 2.7 0 1 1-5.2-1l-3.8-1.6A10 10 0 1 0 12 2zm1.4 6.1a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6zm-5.6 7.2.9.4a2.7 2.7 0 0 1 3.5 1.7 2.7 2.7 0 0 1-1.7 3.5 2.7 2.7 0 0 1-3.5-1.7l-.9-.4.2-.8.9.4a1.5 1.5 0 0 0 1.9.9 1.5 1.5 0 0 0 .9-1.9 1.5 1.5 0 0 0-1.9-.9l-.9-.4.2-.7z"
        />
      );
    case "xbox":
      return (
        <path
          fill="currentColor"
          d="M4.1 4.4C6.1 2.9 8.9 2 12 2s5.9.9 7.9 2.4c-1.6 1.8-3.9 4.7-5.2 6.7-.7-1.3-1.7-2.9-2.7-4.3-1 1.4-2 3-2.7 4.3C8 9.1 5.7 6.2 4.1 4.4zm7.9 8.3c1.3 2.1 3.6 5.2 5.2 7C15.2 21.2 13.7 22 12 22s-3.2-.8-5.2-2.3c1.6-1.8 3.9-4.9 5.2-7zM3.2 6.1C2.4 7.8 2 9.8 2 12c0 2.6.7 5 1.9 7 .7-1.7 2.5-4.5 4.2-6.7-1.7-2.1-3.5-4.6-4.9-6.2zm17.6 0c-1.4 1.6-3.2 4.1-4.9 6.2 1.7 2.2 3.5 5 4.2 6.7 1.2-2 1.9-4.4 1.9-7 0-2.2-.4-4.2-1.2-5.9z"
        />
      );
    case "battlenet":
      return (
        <path
          fill="currentColor"
          d="M12 2c2.4 0 4.5.7 6 2.1l-1.5 1.7A6.7 6.7 0 0 0 12 4.5 7.5 7.5 0 0 0 4.5 12c0 1.5.4 2.8 1.2 3.9L4 17.3A10 10 0 0 1 2 12C2 6.5 6.5 2 12 2zm0 20c-2.4 0-4.5-.7-6-2.1l1.5-1.7A6.7 6.7 0 0 0 12 19.5 7.5 7.5 0 0 0 19.5 12c0-1.5-.4-2.8-1.2-3.9L20 6.7A10 10 0 0 1 22 12c0 5.5-4.5 10-10 10zm-4.2-8.4 2.2-3.8h1.8L9.6 14h4.1l-.7 1.6H7.8zm5.4-3.8h1.7l2.1 3.8H15l-1.8-3.8z"
        />
      );
    case "ea":
      return (
        <path
          fill="currentColor"
          d="M3 7.5h8.2l1.1 2.4H6.8L8 12.5h5.1l1.1 2.4H5.4L3 7.5zm10.8 0H21l-1.2 2.4h-4.3L14.4 12h3.9L17.2 14.9h-5.2L13.8 7.5z"
        />
      );
    case "epic":
      return (
        <path
          fill="currentColor"
          d="M7 4h10v2.2H9.4V11H16v2.1H9.4v4.7H17V20H7V4z"
        />
      );
    case "ubisoft":
      return (
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .1 20A10 10 0 0 0 12 2zm0 2.4a7.6 7.6 0 0 1 6.1 12.1l-2-1.4A5.2 5.2 0 1 0 12 17.2c1.4 0 2.7-.6 3.6-1.5l2 1.5A7.6 7.6 0 0 1 12 19.6 7.6 7.6 0 0 1 12 4.4z"
        />
      );
    case "riot":
      return (
        <path
          fill="currentColor"
          d="M4 5.5 15.5 3l4.5 4.2L18 19.5 6.8 21 4 5.5zm3.2 2.3 1.5 9.4 7.4-1.1.9-7.4-2.6-2.3-7.2 1.4z"
        />
      );
    case "playstation":
      return (
        <path
          fill="currentColor"
          d="M8.4 15.8c-1.7.5-2.9.4-3.7-.1-.9-.6-.8-1.6.3-2.3l1.6-1v2.1l1.8.6V8.6L4.8 10c-2.3.8-3.3 2-2.9 3.6.5 1.9 2.5 2.7 5.5 2.1l1-.3v-2.1l-.9.5zm5.1-8.2v11.1l3.1-1.1V6.2c0-1.1.3-1.7 1.1-1.5.9.2 1.1 1 1.1 2.1v2.5l2.1-.7V6.4c0-2.1-.7-3.4-2.9-3.1-2 .3-4.5 1.6-4.5 4.3zm-2.5 4.7v2.4l4.1 1.5v-2.4l-4.1-1.5z"
        />
      );
    case "nintendo":
      return (
        <path
          fill="currentColor"
          d="M6.5 3h4.2v18H6.5C4 21 2 19 2 16.5v-9C2 5 4 3 6.5 3zm7 0H17.5C20 3 22 5 22 7.5v9c0 2.5-2 4.5-4.5 4.5H13.5V3zM7.8 10.2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8.4 6.6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
        />
      );
    default:
      return (
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .1 20A10 10 0 0 0 12 2zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2z"
        />
      );
  }
}
