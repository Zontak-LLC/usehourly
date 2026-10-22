/** Three small looping drawings for the guide's first steps: a time being typed, an invoice filling in, a PAID stamp. */

export function StepArt({ step }: { step: 0 | 1 | 2 }) {
  if (step === 0) {
    return (
      <svg viewBox="0 0 160 70" aria-hidden className="h-16 w-full">
        <rect x="8" y="8" width="144" height="32" rx="10" fill="var(--card)" stroke="var(--amber)" strokeWidth="2" />
        <text x="22" y="30" fontSize="15" fontFamily="var(--font-mono), monospace" fill="var(--foreground)">
          1h30
        </text>
        <rect x="68" y="19" width="2" height="14" fill="var(--amber)" />
        <rect x="8" y="52" width="144" height="8" rx="4" fill="var(--muted)" />
        <rect x="8" y="52" width="86" height="8" rx="4" fill="var(--amber)" style={{ transformOrigin: "8px 56px" }} />
      </svg>
    );
  }
  if (step === 1) {
    return (
      <svg viewBox="0 0 160 70" aria-hidden className="h-16 w-full">
        <rect x="46" y="4" width="68" height="62" rx="6" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <rect x="46" y="4" width="68" height="6" rx="3" fill="var(--amber)" />
        {[20, 30, 40].map((y, i) => (
          <rect
            key={y}
            x="54"
            y={y}
            width={i === 2 ? 30 : 52}
            height="4"
            rx="2"
            fill="var(--muted-foreground)"
            opacity="0.5"
            style={{ transformOrigin: `54px ${y + 2}px`, animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <rect x="80" y="52" width="26" height="8" rx="4" fill="var(--amber)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 70" aria-hidden className="h-16 w-full">
      <rect x="46" y="4" width="68" height="62" rx="6" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      <rect x="54" y="16" width="52" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="54" y="26" width="38" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <g style={{ transformOrigin: "80px 46px" }}>
        <rect x="52" y="36" width="56" height="22" rx="5" fill="none" stroke="var(--success-bright)" strokeWidth="3" />
        <text x="80" y="52" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--success-bright)">
          PAID
        </text>
      </g>
    </svg>
  );
}
