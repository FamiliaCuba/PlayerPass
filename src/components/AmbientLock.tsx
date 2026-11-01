/** Fondo decorativo sutil: cerradura + llave, sin robar foco. */
export function AmbientLock() {
  return (
    <div className="ambient-lock" aria-hidden>
      <svg className="ambient-lock-svg" viewBox="0 0 240 240" fill="none">
        <defs>
          <linearGradient id="lockStroke" x1="40" y1="20" x2="200" y2="220">
            <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#F5F5F7" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <g className="ambient-lock-body">
          <path
            d="M78 108V86c0-23.2 18.8-42 42-42s42 18.8 42 42v22"
            stroke="url(#lockStroke)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <rect
            x="62"
            y="108"
            width="116"
            height="96"
            rx="22"
            stroke="url(#lockStroke)"
            strokeWidth="8"
          />
          <circle cx="120" cy="148" r="10" fill="url(#lockStroke)" opacity="0.7" />
          <path
            d="M120 158v22"
            stroke="url(#lockStroke)"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </g>
        <g className="ambient-key">
          <path
            d="M156 48h46c8 0 14 6 14 14v8c0 8-6 14-14 14h-10l-8 18h-12l6-18h-22a18 18 0 1 1 0-36z"
            stroke="url(#lockStroke)"
            strokeWidth="5"
            strokeLinejoin="round"
            opacity="0.55"
          />
          <circle cx="156" cy="66" r="6" fill="url(#lockStroke)" opacity="0.45" />
        </g>
      </svg>
    </div>
  );
}
