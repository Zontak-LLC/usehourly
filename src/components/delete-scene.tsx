/**
 * A calm picture for "Delete my account": a bin, with a few tiles drifting slowly down and dimming. No sparkles, no
 * hurry. Pure drawing and CSS (`delete-scene` in globals.css); decoration only.
 */
export function DeleteScene({ className }: { className?: string }) {
  const tiles = [
    { x: 74, delay: "0s" },
    { x: 100, delay: "-2.3s" },
    { x: 126, delay: "-4.6s" },
  ];
  return (
    <svg viewBox="0 6 200 140" aria-hidden className={`delete-scene ${className ?? ""}`}>
      {tiles.map((t) => (
        <g key={t.x} className="ds-tile" style={{ animationDelay: t.delay }}>
          <rect
            x={t.x - 8}
            y="24"
            width="20"
            height="26"
            rx="4"
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <line
            x1={t.x - 3}
            y1="33"
            x2={t.x + 7}
            y2="33"
            stroke="var(--border)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1={t.x - 3}
            y1="40"
            x2={t.x + 7}
            y2="40"
            stroke="var(--border)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ))}
      <path
        d="M66 72 H134 l-6 52 a8 8 0 0 1-8 7 H80 a8 8 0 0 1-8-7z"
        fill="var(--card)"
        stroke="var(--destructive)"
        strokeWidth="2"
        opacity="0.9"
      />
      <rect x="60" y="62" width="80" height="10" rx="5" fill="var(--destructive)" opacity="0.55" />
      <line
        x1="88"
        y1="86"
        x2="90"
        y2="116"
        stroke="var(--destructive)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="100"
        y1="86"
        x2="100"
        y2="116"
        stroke="var(--destructive)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="112"
        y1="86"
        x2="110"
        y2="116"
        stroke="var(--destructive)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
