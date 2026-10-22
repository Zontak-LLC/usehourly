/**
 * A picture for "Import history": a CSV page slides toward UseHourly, its rows land as coloured entries and a tick pops.
 * Pure drawing and CSS (see `import-scene` in globals.css); decoration only, so it is hidden from screen readers.
 */
export function ImportScene({ className }: { className?: string }) {
  const bars: { y: number; w: number; color: string; delay: string }[] = [
    { y: 56, w: 64, color: "#F5A524", delay: "0s" },
    { y: 74, w: 50, color: "#8A6CFF", delay: "0.3s" },
    { y: 92, w: 58, color: "#3DDC97", delay: "0.6s" },
  ];
  return (
    <svg viewBox="0 6 200 140" aria-hidden className={`import-scene ${className ?? ""}`}>
      <rect x="94" y="22" width="96" height="108" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="112" cy="40" r="8" fill="none" stroke="var(--foreground)" strokeWidth="2" />
      <path d="M112 35 V40 L116 42" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" />
      {bars.map((b) => (
        <rect
          key={b.y}
          className="is-bar"
          style={{ animationDelay: b.delay }}
          x="106"
          y={b.y}
          width={b.w}
          height="10"
          rx="5"
          fill={b.color}
        />
      ))}
      <g className="is-tick">
        <circle cx="176" cy="34" r="11" fill="#3DDC97" />
        <path d="M170 34 L174.5 38.5 L182 30" fill="none" stroke="#08140E" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g className="is-file">
        <rect x="14" y="40" width="46" height="62" rx="6" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <text x="37" y="55" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--amber)">
          CSV
        </text>
        {[64, 74, 84, 94].map((y) => (
          <line key={y} x1="22" y1={y} x2="52" y2={y} stroke="var(--border)" strokeWidth="2.5" strokeLinecap="round" />
        ))}
      </g>
    </svg>
  );
}
