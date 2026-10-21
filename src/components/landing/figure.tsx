type FigureProps = {
  top: string;
  bottom: string;
  className?: string;
};

// Stylized fashion-illustration figure used in place of real photos.
export function Figure({ top, bottom, className }: FigureProps) {
  const skin = "#e3b48f";
  return (
    <svg viewBox="0 0 200 400" className={className} aria-hidden="true">
      <ellipse cx="100" cy="384" rx="62" ry="7" fill="#1e1915" opacity="0.08" />
      {/* hair back */}
      <path d="M70 70 Q66 26 100 24 Q134 26 130 70 L134 118 Q100 126 66 118 Z" fill="#2b211c" />
      {/* neck + face */}
      <rect x="91" y="80" width="18" height="24" rx="6" fill={skin} />
      <ellipse cx="100" cy="62" rx="22" ry="27" fill={skin} />
      <path d="M78 52 Q84 30 104 32 Q124 36 123 58 Q110 44 78 52 Z" fill="#2b211c" />
      {/* arms */}
      <path d="M62 112 Q50 150 44 208 L56 211 Q64 160 76 128 Z" fill={top} />
      <path d="M138 112 Q150 150 156 208 L144 211 Q136 160 124 128 Z" fill={top} />
      <circle cx="50" cy="216" r="7" fill={skin} />
      <circle cx="150" cy="216" r="7" fill={skin} />
      {/* top */}
      <path d="M62 112 Q100 96 138 112 L146 202 Q100 214 54 202 Z" fill={top} />
      <path d="M88 101 L100 122 L112 101" fill="none" stroke="#1e1915" strokeOpacity="0.15" strokeWidth="2" />
      {/* bottom */}
      <path d="M54 198 Q100 210 146 198 L156 352 L112 356 L100 250 L88 356 L44 352 Z" fill={bottom} />
      {/* shoes */}
      <rect x="44" y="352" width="44" height="12" rx="6" fill="#1e1915" />
      <rect x="112" y="352" width="44" height="12" rx="6" fill="#1e1915" />
    </svg>
  );
}
