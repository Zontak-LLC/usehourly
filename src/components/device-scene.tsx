/**
 * A picture for "Keep a copy on this device": a screen fills with entries while the cloud is crossed out (no
 * connection), then a tick says they are safe. Pure drawing and CSS (`device-scene` in globals.css); decoration only.
 */
export function DeviceScene({ className }: { className?: string }) {
  const bars = [
    { y: 46, w: 70, color: "#F5A524", delay: "0s" },
    { y: 62, w: 54, color: "#8A6CFF", delay: "0.3s" },
    { y: 78, w: 62, color: "#3DDC97", delay: "0.6s" },
  ];
  return (
    <svg viewBox="0 6 200 140" aria-hidden className={`device-scene ${className ?? ""}`}>
      <rect x="34" y="26" width="132" height="86" rx="10" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="44" y="36" width="112" height="66" rx="6" fill="var(--muted)" opacity="0.6" />
      <path
        d="M22 118 H178 a4 4 0 0 1 0 8 H22 a4 4 0 0 1 0-8z"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="2"
      />
      {bars.map((b) => (
        <rect
          key={b.y}
          className="is-bar"
          style={{ animationDelay: b.delay }}
          x="54"
          y={b.y}
          width={b.w}
          height="9"
          rx="4.5"
          fill={b.color}
        />
      ))}
      <g opacity="0.9">
        <path
          d="M150 22 a9 9 0 0 1 17-3 a7 7 0 0 1 3 13 h-22 a7 7 0 0 1 2-10z"
          transform="translate(-6 -8)"
          fill="var(--card)"
          stroke="var(--muted-foreground)"
          strokeWidth="2"
        />
        <line x1="140" y1="30" x2="166" y2="8" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="is-tick">
        <circle cx="146" cy="92" r="11" fill="#3DDC97" />
        <path d="M140 92 L144.5 96.5 L152 88" fill="none" stroke="#08140E" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
