/**
 * A picture for "Accounting app": an invoice slides toward the books, its lines land as ticked rows with amounts, and a
 * total settles at the foot. Pure drawing and CSS (the `acct-scene` rules in globals.css); decoration only.
 */
export function AccountingScene({ className }: { className?: string }) {
  const rows = [48, 68, 88];
  return (
    <svg viewBox="0 6 200 140" aria-hidden className={`acct-scene ${className ?? ""}`}>
      <rect x="94" y="22" width="96" height="108" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="106" y="32" width="30" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.5" />
      {rows.map((y, i) => (
        <g key={y}>
          <rect x="106" y={y} width="44" height="8" rx="4" fill="var(--muted)" />
          <g className="is-tick" style={{ animationDelay: `${i * 0.3}s` }}>
            <circle cx="177" cy={y + 4} r="6" fill="#3DDC97" />
            <path
              d={`M174 ${y + 4} L176.2 ${y + 6.2} L180 ${y + 2}`}
              fill="none"
              stroke="#08140E"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
          <rect
            className="is-bar"
            style={{ animationDelay: `${i * 0.3}s` }}
            x="154"
            y={y}
            width="14"
            height="8"
            rx="4"
            fill="#F5A524"
          />
        </g>
      ))}
      <rect
        className="is-bar"
        style={{ animationDelay: "0.9s" }}
        x="106"
        y="112"
        width="72"
        height="8"
        rx="4"
        fill="#8A6CFF"
      />
      <g className="is-file">
        <rect x="14" y="34" width="46" height="70" rx="6" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <text x="22" y="48" fontSize="8" fontWeight="700" fill="var(--amber)">
          INVOICE
        </text>
        {[56, 66, 76].map((y) => (
          <line key={y} x1="22" y1={y} x2="52" y2={y} stroke="var(--border)" strokeWidth="2.5" strokeLinecap="round" />
        ))}
        <text x="52" y="97" textAnchor="end" fontSize="11" fontWeight="800" fill="var(--foreground)">
          $
        </text>
      </g>
    </svg>
  );
}
