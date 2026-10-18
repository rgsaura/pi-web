import React from "react";

export interface ExoLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
}

/**
 * ExoLogo — Official Brand Mark of EXOHUMAN.
 *
 * Characteristics:
 * - Inverted triangle (pointing downward)
 * - Beveled cyber-minimalist geometry with rounded vertices
 * - Subtle inner cut-out echoing the outer silhouette (monogrammatic shield/delta)
 * - Refined gradient from vibrant cyan/sky (#38bdf8) to deep cobalt/electric blue (#2563eb)
 */
export function ExoLogo({
  size = 24,
  className,
  style,
  glow = false,
}: ExoLogoProps) {
  const filterId = `exo-glow-${size}`;
  const gradId = `exo-grad-${size}`;
  const innerGradId = `exo-inner-grad-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="ExoHuman Logo"
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        <linearGradient id={innerGradId} x1="16" y1="14" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.7" />
        </linearGradient>

        {glow && (
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}
      </defs>

      {/* Main outer inverted triangle with rounded corners and bevel */}
      <path
        d="M 6.8 9.5 
           C 5.2 6.8, 7.2 4, 10.4 4 
           L 37.6 4 
           C 40.8 4, 42.8 6.8, 41.2 9.5 
           L 27.6 39.8 
           C 26.0 43.3, 22.0 43.3, 20.4 39.8 
           Z"
        fill={`url(#${gradId})`}
        filter={glow ? `url(#${filterId})` : undefined}
      />

      {/* Inner geometric notch / inverted aperture */}
      <path
        d="M 15.5 12
           L 32.5 12
           C 33.8 12, 34.6 13.2, 33.9 14.3
           L 25.4 31.8
           C 24.7 33.2, 23.3 33.2, 22.6 31.8
           L 14.1 14.3
           C 13.4 13.2, 14.2 12, 15.5 12
           Z"
        fill="var(--bg-panel, #111827)"
      />

      {/* Futuristic core jewel / focal chevron accent */}
      <path
        d="M 21.2 16.5
           L 26.8 16.5
           C 27.4 16.5, 27.8 17.1, 27.5 17.6
           L 24.7 23.4
           C 24.4 24.0, 23.6 24.0, 23.3 23.4
           L 20.5 17.6
           C 20.2 17.1, 20.6 16.5, 21.2 16.5
           Z"
        fill={`url(#${innerGradId})`}
      />
    </svg>
  );
}
