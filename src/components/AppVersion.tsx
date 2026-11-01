import { APP_VERSION } from "../lib/version";

export function AppVersion() {
  return (
    <span className="app-version" aria-label={`Version ${APP_VERSION}`}>
      v{APP_VERSION}
    </span>
  );
}
