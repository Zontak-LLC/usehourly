/**
 * A picture for "Download everything": a workbook and two CSV files drop into a box, the lid shuts and sparkles pop.
 * Pure drawing and CSS (see `export-scene` in globals.css); it is decoration, so it is hidden from screen readers.
 */
export function ExportScene({ className }: { className?: string }) {
  const files: { x: number; label: string; color: string; delay: string }[] = [
    { x: 66, label: "XLSX", color: "#3DDC97", delay: "0s" },
    { x: 100, label: "CSV", color: "#F5A524", delay: "0.45s" },
    { x: 134, label: "CSV", color: "#8A6CFF", delay: "0.9s" },
  ];
  const sparks: [number, number, number][] = [
    [40, 56, 7],
    [206, 44, 9],
    [190, 100, 6],
    [54, 112, 5],
  ];
  return (
    <svg viewBox="30 0 184 166" aria-hidden className={`export-scene ${className ?? ""}`}>
      <rect x="56" y="96" width="128" height="62" rx="12" fill="var(--muted)" stroke="var(--border)" strokeWidth="2" />
      {files.map((f) => (
        <g key={f.x} className="es-file" style={{ animationDelay: f.delay }}>
          <rect x={f.x} y="14" width="32" height="42" rx="5" fill="var(--card)" stroke={f.color} strokeWidth="2" />
          <line x1={f.x + 7} y1="26" x2={f.x + 25} y2="26" stroke={f.color} strokeWidth="2" strokeLinecap="round" />
          <line
            x1={f.x + 7}
            y1="34"
            x2={f.x + 25}
            y2="34"
            stroke="var(--border)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <text x={f.x + 16} y="49" textAnchor="middle" fontSize="8" fontWeight="700" fill={f.color}>
            {f.label}
          </text>
        </g>
      ))}
      <path
        d="M56 108 a12 12 0 0 1 12-12 h104 a12 12 0 0 1 12 12 v38 a12 12 0 0 1-12 12 h-104 a12 12 0 0 1-12-12z"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <line x1="120" y1="104" x2="120" y2="150" stroke="var(--border)" strokeWidth="2" strokeDasharray="3 4" />
      <rect x="112" y="120" width="16" height="12" rx="4" fill="var(--amber)" />
      <g className="es-lid">
        <rect x="50" y="86" width="140" height="14" rx="7" fill="var(--amber)" />
      </g>
      {sparks.map(([x, y, r]) => (
        <path
          key={`${x}-${y}`}
          className="es-spark"
          d={`M${x} ${y - r} L${x + r / 3} ${y - r / 3} L${x + r} ${y} L${x + r / 3} ${y + r / 3} L${x} ${y + r} L${x - r / 3} ${y + r / 3} L${x - r} ${y} L${x - r / 3} ${y - r / 3}Z`}
          fill="var(--amber)"
        />
      ))}
    </svg>
  );
}
