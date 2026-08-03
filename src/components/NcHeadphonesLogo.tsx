import React from 'react';

interface NcHeadphonesLogoProps {
  className?: string;
  size?: number;
}

export function NcHeadphonesLogo({ className = "w-9 h-9", size }: NcHeadphonesLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`} style={style}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_0_12px_rgba(37,99,235,0.6)]"
      >
        <defs>
          <linearGradient id="ncRoyalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>

          <linearGradient id="yellowGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>

          <linearGradient id="mauveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>

          <filter id="logoGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* NC State Outline silhouette (Stylized High-Definition Map Vector) */}
        <path
          d="M 10 48 L 18 44 L 26 46 L 34 43 L 44 41 L 56 41 L 68 39 L 78 39 L 88 44 L 92 48 L 90 54 L 84 57 L 85 62 L 80 64 L 74 61 L 66 59 L 52 59 L 36 59 L 24 57 L 16 56 L 10 50 Z"
          fill="url(#ncRoyalGrad)"
          stroke="url(#yellowGoldGrad)"
          strokeWidth="2"
          filter="url(#logoGlow)"
        />

        {/* Capital Star over Raleigh / NC Center */}
        <polygon
          points="68,46 69.5,50 73.5,50 70.5,52.5 71.5,56.5 68,54 64.5,56.5 65.5,52.5 62.5,50 66.5,50"
          fill="#facc15"
        />

        {/* Heavy Studio Headphone Band Wrapped over NC State */}
        <path
          d="M 14 52 C 14 18, 86 18, 86 52"
          stroke="url(#yellowGoldGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M 20 48 C 20 25, 80 25, 80 48"
          stroke="url(#mauveGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Left Ear Cup */}
        <rect x="8" y="42" width="12" height="24" rx="6" fill="#000000" stroke="#facc15" strokeWidth="2" />
        <rect x="10" y="45" width="8" height="18" rx="4" fill="#2563eb" />

        {/* Right Ear Cup */}
        <rect x="80" y="42" width="12" height="24" rx="6" fill="#000000" stroke="#facc15" strokeWidth="2" />
        <rect x="82" y="45" width="8" height="18" rx="4" fill="#2563eb" />

        {/* Audio Wave / Pulse Accent */}
        <path
          d="M 32 50 L 38 46 L 44 54 L 50 44 L 56 56 L 62 48 L 68 50"
          stroke="#facc15"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
