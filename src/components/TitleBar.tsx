import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let alive = true;
    void win.isMaximized().then((v) => {
      if (alive) setMaximized(v);
    });
    const unlisten = win.onResized(() => {
      void win.isMaximized().then((v) => {
        if (alive) setMaximized(v);
      });
    });
    return () => {
      alive = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function minimize() {
    await getCurrentWindow().minimize();
  }

  async function toggleMaximize() {
    await getCurrentWindow().toggleMaximize();
  }

  async function close() {
    await getCurrentWindow().close();
  }

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <img src="/logo.svg" alt="" className="titlebar-logo" />
        <span data-tauri-drag-region>PlayerPass</span>
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          aria-label="Minimizar"
          onClick={() => void minimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void toggleMaximize()}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M3.5 4.5h4v4h-4v-4zm1.5-1.5h4.5v4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect
                x="2.5"
                y="2.5"
                width="7"
                height="7"
                rx="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn close"
          aria-label="Cerrar"
          onClick={() => void close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M3 3l6 6M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
